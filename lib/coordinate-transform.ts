/**
 * UTM / projected CRS → WGS84 (EPSG:4326) for QField map preview.
 * Uses GeoPackage spatial ref when available; falls back to UTM heuristics (Iraq/MENA).
 */
import proj4 from 'proj4';

export type Wgs84Point = { lat: number; lng: number };

const WGS84 = 'EPSG:4326';

/** Common Iraq / MENA UTM zones (WGS84). */
const UTM_ZONE_EPSG_N: Record<number, number> = {
  37: 32637,
  38: 32638,
  39: 32639,
  40: 32640,
};

export function isWgs84LatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function looksLikeProjectedMeters(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (isWgs84LatLng(y, x)) return false;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return ax >= 1e4 && ax <= 1e7 && ay >= 1e4 && ay <= 1.2e7;
}

export function epsgCodeFromAuth(organization: string | null | undefined, id: number | null | undefined): number | null {
  if (!organization || id == null || !Number.isFinite(id)) return null;
  if (organization.toUpperCase() === 'EPSG') return Math.trunc(id);
  return null;
}

/** Parse EPSG code from WKT / proj4 definition text. */
export function parseEpsgFromDefinition(definition: string | null | undefined): number | null {
  if (!definition) return null;
  const m =
    definition.match(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*(\d+)\s*\]/i) ??
    definition.match(/EPSG::(\d+)/i) ??
    definition.match(/EPSG:(\d+)/i);
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  const zoneM = definition.match(/UTM\s+zone\s+(\d{1,2})\s*([NnSs])?/i);
  if (zoneM?.[1]) {
    const zone = parseInt(zoneM[1], 10);
    const south = (zoneM[2] ?? 'N').toUpperCase() === 'S';
    if (zone >= 1 && zone <= 60) return south ? 32700 + zone : 32600 + zone;
  }
  return null;
}

export type GpkgSrsEntry = {
  srsId: number;
  definition: string | null;
  epsg: number | null;
};

export function buildProj4FromSrs(entry: GpkgSrsEntry): string | null {
  if (entry.epsg != null) return `EPSG:${entry.epsg}`;
  const def = entry.definition?.trim();
  if (!def) return null;
  if (/^EPSG:\d+$/i.test(def)) return def.toUpperCase();
  return def;
}

function ensureProj4Def(code: string, def?: string): void {
  try {
    if (proj4.defs(code)) return;
  } catch {
    /* proj4 throws if missing in some versions */
  }
  if (def) {
    try {
      proj4.defs(code, def);
    } catch {
      /* already registered */
    }
  }
}

function utmProj4String(zone: number, northern: boolean): string {
  return `+proj=utm +zone=${zone} ${northern ? '' : '+south '}+datum=WGS84 +units=m +no_defs`;
}

function registerUtmEpsg(epsg: number): string {
  const code = `EPSG:${epsg}`;
  ensureProj4Def(code, utmProj4String(epsg - 32600, true));
  return code;
}

/** Guess UTM EPSG from easting/northing (tries zones 37–40, picks plausible Iraq/MENA lat/lng). */
export function guessUtmEpsgFromProjected(x: number, y: number): number | null {
  if (!looksLikeProjectedMeters(x, y)) return null;
  let best: { epsg: number; score: number } | null = null;
  for (const zone of [38, 39, 37, 40]) {
    const epsg = UTM_ZONE_EPSG_N[zone];
    if (!epsg) continue;
    const pt = reprojectProjectedToWgs84(x, y, `EPSG:${epsg}`);
    if (!pt) continue;
    if (pt.lat < 22 || pt.lat > 42 || pt.lng < 34 || pt.lng > 55) continue;
    const score = Math.abs(pt.lat - 33) + Math.abs(pt.lng - 44);
    if (!best || score < best.score) best = { epsg, score };
  }
  return best?.epsg ?? null;
}

export function reprojectProjectedToWgs84(
  x: number,
  y: number,
  fromProj: string
): Wgs84Point | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !fromProj.trim()) return null;
  try {
    ensureProj4Def(WGS84);
    const from = fromProj.trim();
    if (/^EPSG:\d+$/i.test(from)) {
      const epsg = parseInt(from.slice(5), 10);
      if (epsg >= 32601 && epsg <= 32660) registerUtmEpsg(epsg);
    }
    const out = proj4(from, WGS84, [x, y]) as [number, number];
    const lng = out[0];
    const lat = out[1];
    if (!isWgs84LatLng(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function reprojectProjectedToWgs84WithEpsg(
  x: number,
  y: number,
  epsg: number | null,
  definition: string | null
): Wgs84Point | null {
  if (epsg != null) {
    const r = reprojectProjectedToWgs84(x, y, `EPSG:${epsg}`);
    if (r) return r;
  }
  if (definition) {
    const r = reprojectProjectedToWgs84(x, y, definition);
    if (r) return r;
  }
  const guessed = guessUtmEpsgFromProjected(x, y);
  if (guessed != null) return reprojectProjectedToWgs84(x, y, `EPSG:${guessed}`);
  return null;
}

type GeoJsonGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPoint'; coordinates: [number, number][] }
  | { type: 'MultiLineString'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] };

function transformPair(
  x: number,
  y: number,
  fromProj: string
): [number, number] | null {
  const w = reprojectProjectedToWgs84(x, y, fromProj);
  if (!w) return null;
  return [w.lng, w.lat];
}

/** Reproject GeoJSON geometry coordinates to WGS84 [lon, lat]. Returns null if nothing changed. */
export function reprojectGeoJsonToWgs84(
  geom: GeoJsonGeometry,
  fromProj: string
): GeoJsonGeometry | null {
  const walk = (coords: unknown): unknown => {
    if (!Array.isArray(coords)) return coords;
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number' &&
      (coords.length === 2 || typeof coords[2] !== 'number')
    ) {
      const x = coords[0] as number;
      const y = coords[1] as number;
      if (isWgs84LatLng(y, x)) return [x, y];
      const t = transformPair(x, y, fromProj);
      return t ?? coords;
    }
    return coords.map((c) => walk(c));
  };

  if (geom.type === 'GeometryCollection') {
    const geometries = geom.geometries
      .map((g) => reprojectGeoJsonToWgs84(g, fromProj))
      .filter((g): g is GeoJsonGeometry => g != null);
    if (geometries.length === 0) return null;
    return { type: 'GeometryCollection', geometries };
  }

  if (!('coordinates' in geom) || !geom.coordinates) return null;
  const next = walk(geom.coordinates);
  return { ...geom, coordinates: next } as GeoJsonGeometry;
}

const EASTING_KEYS = ['easting', 'x', 'lon', 'lng', 'longitude', 'long'];
const NORTHING_KEYS = ['northing', 'y', 'lat', 'latitude'];

function pickNum(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (!(k in row)) continue;
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  for (const [key, v] of Object.entries(row)) {
    const lk = key.toLowerCase();
    for (const want of keys) {
      if (lk !== want.toLowerCase()) continue;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = parseFloat(v.trim());
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

/** Add latitude/longitude to SQL attribute rows when easting/northing are projected. */
export function enrichRowsWithWgs84(
  rows: Record<string, string | number | boolean | null>[],
  fromProj: string | null,
  epsg: number | null
): void {
  const proj =
    fromProj ??
    (epsg != null ? `EPSG:${epsg}` : null);
  for (const row of rows) {
    const lat = pickNum(row as Record<string, unknown>, ['lat', 'latitude', 'LAT']);
    const lng = pickNum(row as Record<string, unknown>, ['lon', 'lng', 'longitude', 'long', 'LON']);
    if (lat != null && lng != null && isWgs84LatLng(lat, lng)) continue;

    const east = pickNum(row as Record<string, unknown>, EASTING_KEYS);
    const north = pickNum(row as Record<string, unknown>, NORTHING_KEYS);
    if (east == null || north == null) continue;
    if (!looksLikeProjectedMeters(east, north)) continue;

    let wgs: Wgs84Point | null = null;
    if (proj) wgs = reprojectProjectedToWgs84(east, north, proj);
    if (!wgs) wgs = reprojectProjectedToWgs84WithEpsg(east, north, epsg, null);
    if (!wgs) continue;
    row.latitude = Math.round(wgs.lat * 1e7) / 1e7;
    row.longitude = Math.round(wgs.lng * 1e7) / 1e7;
  }
}

/** Load srs_id → proj source from an open sql.js GeoPackage database. */
export function loadGpkgSpatialRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  quoteId: (ident: string) => string
): { srsById: Map<number, GpkgSrsEntry>; srsByTable: Map<string, number> } {
  const srsById = new Map<number, GpkgSrsEntry>();
  const srsByTable = new Map<string, number>();

  try {
    const stmt = db.prepare(
      'SELECT srs_id AS id, organization AS org, organization_coordsys_id AS oid, definition AS def FROM gpkg_spatial_ref_sys'
    );
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        id?: number;
        org?: string;
        oid?: number;
        def?: string;
      };
      if (row.id == null) continue;
      const srsId = Number(row.id);
      const epsg =
        epsgCodeFromAuth(row.org, row.oid != null ? Number(row.oid) : null) ??
        parseEpsgFromDefinition(row.def ?? null);
      srsById.set(srsId, {
        srsId,
        definition: row.def ?? null,
        epsg,
      });
    }
    stmt.free();
  } catch {
    /* not GeoPackage */
  }

  try {
    const stmt = db.prepare('SELECT table_name AS t, srs_id AS s FROM gpkg_geometry_columns');
    while (stmt.step()) {
      const row = stmt.getAsObject() as { t?: string; s?: number };
      if (row.t && row.s != null) srsByTable.set(String(row.t), Number(row.s));
    }
    stmt.free();
  } catch {
    /* ignore */
  }

  return { srsById, srsByTable };
}

export function proj4SourceForTable(
  table: string,
  srsById: Map<number, GpkgSrsEntry>,
  srsByTable: Map<string, number>
): { fromProj: string | null; epsg: number | null } {
  const srsId = srsByTable.get(table);
  if (srsId == null) return { fromProj: null, epsg: null };
  const entry = srsById.get(srsId);
  if (!entry) return { fromProj: null, epsg: null };
  const fromProj = buildProj4FromSrs(entry);
  return { fromProj, epsg: entry.epsg };
}

/** Reproject geometry using SRS, or guess UTM when coordinates look projected. */
export function reprojectGeoJsonToWgs84Auto(
  geom: GeoJsonGeometry,
  fromProj: string | null,
  epsg: number | null
): GeoJsonGeometry | null {
  if (!geometryNeedsReproject(geom)) return geom;
  if (fromProj) {
    const r = reprojectGeoJsonToWgs84(geom, fromProj);
    if (r) return r;
  }
  if (epsg != null) {
    const r = reprojectGeoJsonToWgs84(geom, `EPSG:${epsg}`);
    if (r) return r;
  }
  const sample = firstCoordinatePair(geom);
  if (!sample) return null;
  const guessed = guessUtmEpsgFromProjected(sample[0], sample[1]);
  if (guessed == null) return null;
  return reprojectGeoJsonToWgs84(geom, `EPSG:${guessed}`);
}

function firstCoordinatePair(geom: GeoJsonGeometry): [number, number] | null {
  let x: number | undefined;
  let y: number | undefined;
  const walk = (coords: unknown): void => {
    if (x !== undefined || !Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      x = coords[0];
      y = coords[1];
      return;
    }
    for (const c of coords) walk(c);
  };
  if ('coordinates' in geom && geom.coordinates) walk(geom.coordinates);
  if (x === undefined || y === undefined) return null;
  return [x, y];
}

export function geometryNeedsReproject(geom: GeoJsonGeometry): boolean {
  const sample = firstCoordinatePair(geom);
  if (!sample) return false;
  const [x, y] = sample;
  if (isWgs84LatLng(y, x)) return false;
  return looksLikeProjectedMeters(x, y);
}
