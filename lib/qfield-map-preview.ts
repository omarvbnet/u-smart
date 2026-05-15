/**
 * Best-effort map preview for QField packages: GeoPackage vectors (correct GeoPackage BLOB → WKB),
 * GeoJSON sidecars in archives, or QGIS canvas extent from .qgz / .zip.
 * Coordinates are assumed WGS84 where possible; other CRS may appear mis-placed (open in QField for accuracy).
 */

import { strFromU8, unzipSync } from 'fflate';

type GeoJsonGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPoint'; coordinates: [number, number][] }
  | { type: 'MultiLineString'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] };

type GeoJsonFeature = {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = { type: 'FeatureCollection'; features: GeoJsonFeature[] };

export type QFieldMapBounds = { west: number; south: number; east: number; north: number };

export type QFieldMapPreviewResult = {
  geojson: GeoJsonFeatureCollection | null;
  bounds: QFieldMapBounds | null;
  message?: string;
};

const MAX_BYTES = 45 * 1024 * 1024;
const MAX_FEATURES_TOTAL = 500;

/** GeoPackage geometry BLOB: "GP" + version + flags + srs_id + optional envelope, then OGC WKB. */
const GPKG_GEOM_MAGIC = [0x47, 0x50] as const;

const ENVELOPE_BYTES: Record<number, number> = {
  0: 0,
  1: 32,
  2: 48,
  3: 48,
  4: 64,
};

/**
 * Strip GeoPackage binary header so WKB parsers (wkx) receive standard geometry bytes.
 * @see https://www.geopackage.org/spec/#gpb_format
 */
function geopackageBlobToWkb(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 9) return null;
  const isGpkgHeader =
    buf[0] === GPKG_GEOM_MAGIC[0] && buf[1] === GPKG_GEOM_MAGIC[1];
  if (!isGpkgHeader) {
    // Plain OGC WKB (first byte is 0 or 1 = endianness)
    if (buf[0] === 0 || buf[0] === 1) return buf;
    return null;
  }
  const flags = buf[3];
  const empty = ((flags >> 4) & 1) === 1;
  if (empty) return null;
  const envelopeIndicator = (flags >> 1) & 7;
  const envBytes = ENVELOPE_BYTES[envelopeIndicator];
  if (envBytes === undefined) return null;
  const wkbOffset = 8 + envBytes;
  if (buf.length <= wkbOffset) return null;
  return buf.subarray(wkbOffset);
}

function isFiniteCoord(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= 1e7;
}

function inWgsLikeRange(lon: number, lat: number): boolean {
  return Math.abs(lon) <= 180.01 && Math.abs(lat) <= 90.01;
}

function expandBoundsFromGeometry(
  g: GeoJsonGeometry,
  expand: (lon: number, lat: number) => void
): void {
  const walkCoords = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      expand(coords[0] as number, coords[1] as number);
      return;
    }
    for (const c of coords) walkCoords(c);
  };
  if ('coordinates' in g && g.coordinates) walkCoords(g.coordinates);
}

/**
 * GeoJSON sidecars inside QField / project ZIPs (e.g. exported layers as .geojson).
 */
function tryParseGeoJsonBytes(
  bytes: Uint8Array,
  layerLabel: string,
  maxFeatures: number
): { features: GeoJsonFeature[]; bounds: QFieldMapBounds | null } {
  const features: GeoJsonFeature[] = [];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const expandBounds = (lon: number, lat: number) => {
    if (!inWgsLikeRange(lon, lat)) return;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };

  let text: string;
  try {
    text = strFromU8(bytes, true);
  } catch {
    return { features: [], bounds: null };
  }
  let root: unknown;
  try {
    root = JSON.parse(text) as unknown;
  } catch {
    return { features: [], bounds: null };
  }
  if (!root || typeof root !== 'object') return { features: [], bounds: null };
  const o = root as Record<string, unknown>;
  if (o.type !== 'FeatureCollection' || !Array.isArray(o.features)) {
    return { features: [], bounds: null };
  }

  for (const f of o.features) {
    if (features.length >= maxFeatures) break;
    if (!f || typeof f !== 'object') continue;
    const feat = f as Record<string, unknown>;
    if (feat.type !== 'Feature') continue;
    const g = feat.geometry;
    if (!g || typeof g !== 'object') continue;
    const gt = (g as { type?: string }).type;
    if (!gt || gt === 'GeometryCollection') continue;
    const geom = g as GeoJsonGeometry;
    expandBoundsFromGeometry(geom, expandBounds);
    const baseProps =
      feat.properties && typeof feat.properties === 'object'
        ? (feat.properties as Record<string, unknown>)
        : {};
    features.push({
      type: 'Feature',
      properties: {
        ...baseProps,
        layer: layerLabel,
        source: 'geojson',
      },
      geometry: geom,
    });
  }

  const bounds: QFieldMapBounds | null =
    west !== Infinity && south !== Infinity && east !== -Infinity && north !== -Infinity
      ? { west, south, east, north }
      : null;

  return { features, bounds };
}

function parseQgsCanvasExtent(xml: string): QFieldMapBounds | null {
  const re =
    /<extent>[\s\S]*?<xmin>([-0-9.eE+]+)<\/xmin>[\s\S]*?<ymin>([-0-9.eE+]+)<\/ymin>[\s\S]*?<xmax>([-0-9.eE+]+)<\/xmax>[\s\S]*?<ymax>([-0-9.eE+]+)<\/ymax>[\s\S]*?<\/extent>/i;
  const m = xml.match(re);
  if (!m) return null;
  const west = parseFloat(m[1]);
  const south = parseFloat(m[2]);
  const east = parseFloat(m[3]);
  const north = parseFloat(m[4]);
  if (![west, south, east, north].every(isFiniteCoord)) return null;
  return { west, south, east, north };
}

function boundsToPolygonFeature(bounds: QFieldMapBounds, extraProps?: Record<string, unknown>): GeoJsonFeature {
  const { west, south, east, north } = bounds;
  const geom: GeoJsonGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
  return {
    type: 'Feature',
    properties: { kind: 'qgis_project_extent', source: 'qgis_project', ...extraProps },
    geometry: geom,
  };
}

function mergeBounds(a: QFieldMapBounds | null, b: QFieldMapBounds | null): QFieldMapBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    west: Math.min(a.west, b.west),
    south: Math.min(a.south, b.south),
    east: Math.max(a.east, b.east),
    north: Math.max(a.north, b.north),
  };
}

type SqlJsStmt = {
  step: () => boolean;
  getAsObject: () => Record<string, unknown>;
  free: () => void;
};

type SqlJsDb = { prepare: (sql: string) => SqlJsStmt };

/**
 * When gpkg_geometry_columns is missing or empty, infer feature tables + geometry BLOB columns.
 */
function discoverGeometryColumnsFallback(db: SqlJsDb, quoteId: (ident: string) => string): { t: string; c: string }[] {
  const out: { t: string; c: string }[] = [];
  const seen = new Set<string>();
  const add = (table: string, col: string) => {
    const k = `${table}\0${col}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ t: table, c: col });
  };

  const blobGeomNames = /^(geom|geometry|wkb_geometry|the_geom|shape|Geometry)$/i;

  const tryTable = (table: string) => {
    if (!table || table.startsWith('gpkg_') || table.startsWith('rtree_')) return;
    const safe = quoteId(table);
    let stmt: SqlJsStmt;
    try {
      stmt = db.prepare(`PRAGMA table_info("${safe}")`);
    } catch {
      return;
    }
    let foundNamed = false;
    const blobCandidates: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name?: string; type?: string };
      const name = row.name != null ? String(row.name) : '';
      const typ = row.type != null ? String(row.type).toUpperCase() : '';
      if (!name || typ !== 'BLOB') continue;
      if (blobGeomNames.test(name)) {
        add(table, name);
        foundNamed = true;
        break;
      }
      blobCandidates.push(name);
    }
    stmt.free();
    if (!foundNamed && blobCandidates.length === 1) {
      add(table, blobCandidates[0]!);
    }
  };

  let st: SqlJsStmt | null = null;
  try {
    st = db.prepare(
      "SELECT table_name AS t FROM gpkg_contents WHERE data_type = 'features' AND typeof(table_name) = 'text'"
    );
    while (st.step()) {
      const row = st.getAsObject() as { t?: string };
      if (row.t) tryTable(String(row.t));
    }
    st.free();
    st = null;
  } catch {
    try {
      st?.free();
    } catch {
      /* ignore */
    }
  }

  if (out.length === 0) {
    try {
      st = db.prepare(
        "SELECT name AS n FROM sqlite_master WHERE type='table' AND name NOT GLOB 'gpkg_*' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB 'rtree_*'"
      );
      while (st.step()) {
        const row = st.getAsObject() as { n?: string };
        if (row.n) tryTable(String(row.n));
      }
      st.free();
    } catch {
      try {
        st?.free();
      } catch {
        /* ignore */
      }
    }
  }

  return out;
}

/**
 * Extract vector features from a single GeoPackage byte array (WKB → GeoJSON).
 */
async function extractGpkgVectorFeatures(
  bytes: Uint8Array,
  opts: { maxFeatures: number; packagePath: string }
): Promise<{ features: GeoJsonFeature[]; bounds: QFieldMapBounds | null }> {
  const features: GeoJsonFeature[] = [];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const expandBounds = (lon: number, lat: number) => {
    if (!inWgsLikeRange(lon, lat)) return;
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };

  const expandFromGeometry = (g: GeoJsonGeometry | null) => {
    if (!g) return;
    const walkCoords = (coords: unknown): void => {
      if (!Array.isArray(coords)) return;
      if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        expandBounds(coords[0] as number, coords[1] as number);
        return;
      }
      for (const c of coords) walkCoords(c);
    };
    if ('coordinates' in g && g.coordinates) walkCoords(g.coordinates);
  };

  const shortName = opts.packagePath.split('/').pop() ?? opts.packagePath;

  try {
    const initSqlJs = (await import('sql.js')).default;
    const wkxMod = await import('wkx');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wkx = wkxMod as any;
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sqljs.org/dist/${file}`,
    });
    const db = new SQL.Database(bytes);

    const quoteId = (ident: string) => ident.replace(/"/g, '""');

    const loadGeometryTables = (): { t: string; c: string }[] => {
      const tables: { t: string; c: string }[] = [];
      try {
        const stmt = db.prepare(
          'SELECT table_name AS t, column_name AS c FROM gpkg_geometry_columns'
        );
        while (stmt.step()) {
          const row = stmt.getAsObject() as { t?: string; c?: string };
          if (row.t && row.c) tables.push({ t: String(row.t), c: String(row.c) });
        }
        stmt.free();
      } catch {
        /* missing or invalid gpkg_geometry_columns */
      }
      if (tables.length > 0) return tables;
      return discoverGeometryColumnsFallback(db, quoteId);
    };

    const tables = loadGeometryTables();

    if (tables.length === 0) {
      db.close();
      return { features: [], bounds: null };
    }

    const perTableLimit = Math.max(20, Math.ceil(opts.maxFeatures / Math.max(1, tables.length)));

    for (const { t: table, c: geomCol } of tables) {
      if (features.length >= opts.maxFeatures) break;
      if (table.startsWith('gpkg_') || table.startsWith('rtree_')) continue;
      const safeTable = quoteId(table);
      const safeCol = quoteId(geomCol);
      const q = `SELECT "${safeCol}" AS g FROM "${safeTable}" WHERE "${safeCol}" IS NOT NULL LIMIT ${perTableLimit}`;
      let s: ReturnType<typeof db.prepare>;
      try {
        s = db.prepare(q);
      } catch {
        continue;
      }
      while (s.step()) {
        if (features.length >= opts.maxFeatures) break;
        const row = s.getAsObject() as { g?: Uint8Array | ArrayBuffer };
        const raw = row.g;
        if (!raw) continue;
        const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        if (buf.length < 5) continue;
        const wkb = geopackageBlobToWkb(buf);
        let geom: GeoJsonGeometry | null = null;
        if (wkb && wkb.length >= 5) {
          try {
            geom = wkx.Geometry.parse(wkb).toGeoJSON() as GeoJsonGeometry | null;
          } catch {
            /* try full blob below */
          }
        }
        if (!geom && buf.length >= 5) {
          try {
            geom = wkx.Geometry.parse(buf).toGeoJSON() as GeoJsonGeometry | null;
          } catch {
            /* invalid */
          }
        }
        if (!geom) continue;
        expandFromGeometry(geom);
        features.push({
          type: 'Feature',
          properties: {
            layer: table,
            package: shortName,
            packagePath: opts.packagePath,
            source: 'geopackage',
          },
          geometry: geom,
        });
      }
      s.free();
    }

    db.close();

    const bounds: QFieldMapBounds | null =
      west !== Infinity && south !== Infinity && east !== -Infinity && north !== -Infinity
        ? { west, south, east, north }
        : null;

    return { features, bounds };
  } catch {
    return { features: [], bounds: null };
  }
}

async function previewFromGpkg(bytes: Uint8Array, displayName: string): Promise<QFieldMapPreviewResult> {
  const { features, bounds } = await extractGpkgVectorFeatures(bytes, {
    maxFeatures: MAX_FEATURES_TOTAL,
    packagePath: displayName,
  });
  if (features.length === 0) {
    return {
      geojson: null,
      bounds: null,
      message: 'No readable geometries in GeoPackage (CRS may be non‑WGS84 or empty).',
    };
  }
  return {
    geojson: { type: 'FeatureCollection', features },
    bounds,
    message: `${features.length} feature(s) from GeoPackage “${displayName}” (WGS84 assumed; verify in QField if misaligned).`,
  };
}

/**
 * ZIP / QGZ: extract all embedded .gpkg layers + optional .qgs canvas extent into one FeatureCollection.
 */
async function previewFromZipArchive(bytes: Uint8Array, archiveLabel: string): Promise<QFieldMapPreviewResult> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: () => true }) as Record<string, Uint8Array>;
  } catch {
    return { geojson: null, bounds: null, message: 'Could not read archive (zip/qgz).' };
  }

  const keys = Object.keys(files);
  const gpkgKeys = keys
    .filter((k) => k.toLowerCase().endsWith('.gpkg'))
    .sort((a, b) => a.length - b.length);

  const merged: GeoJsonFeature[] = [];
  let unionBounds: QFieldMapBounds | null = null;
  let remaining = MAX_FEATURES_TOTAL;
  let gpkgOk = 0;
  let gpkgSkipped = 0;

  if (gpkgKeys.length > 0) {
    const budgetEach = Math.max(40, Math.floor(MAX_FEATURES_TOTAL / Math.min(gpkgKeys.length, 8)));
    for (const path of gpkgKeys) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, budgetEach);
      const gBytes = files[path];
      if (!gBytes || gBytes.length < 64) {
        gpkgSkipped++;
        continue;
      }
      const { features, bounds } = await extractGpkgVectorFeatures(gBytes, {
        maxFeatures: take,
        packagePath: path.replace(/\\/g, '/'),
      });
      if (features.length > 0) {
        merged.push(...features);
        gpkgOk++;
        unionBounds = mergeBounds(unionBounds, bounds);
        remaining -= features.length;
      } else {
        gpkgSkipped++;
      }
    }
  }

  if (remaining > 0) {
    const jsonKeys = keys
      .filter((k) => {
        const x = k.toLowerCase();
        return x.endsWith('.geojson') || x.endsWith('.json');
      })
      .sort((a, b) => a.length - b.length);

    for (const path of jsonKeys) {
      if (remaining <= 0) break;
      const raw = files[path];
      if (!raw || raw.length < 15 || raw.length > 5 * 1024 * 1024) continue;
      const label = path.replace(/\\/g, '/').split('/').pop() ?? path;
      const { features: gjFeats, bounds: gjBounds } = tryParseGeoJsonBytes(raw, label, remaining);
      if (gjFeats.length === 0) continue;
      merged.push(...gjFeats);
      unionBounds = mergeBounds(unionBounds, gjBounds);
      remaining -= gjFeats.length;
    }
  }

  const qgsKey = keys.find((k) => k.toLowerCase().endsWith('.qgs') && !k.toLowerCase().includes('backup'));
  let extentAdded = false;
  if (qgsKey) {
    try {
      const xml = strFromU8(files[qgsKey], true);
      const ext = parseQgsCanvasExtent(xml);
      if (ext) {
        merged.push(
          boundsToPolygonFeature(ext, {
            projectFile: qgsKey.split('/').pop() ?? qgsKey,
            source: 'qgis_project',
          })
        );
        unionBounds = mergeBounds(unionBounds, ext);
        extentAdded = true;
      }
    } catch {
      /* ignore bad qgs */
    }
  }

  if (merged.length === 0) {
    const hint =
      gpkgKeys.length > 0
        ? 'Archive contained .gpkg file(s) but no readable vector geometries (empty tables, unknown binary layout, or CRS outside WGS84-like bounds for map extent). Add .geojson layers or open in QField.'
        : 'No .gpkg layers, no GeoJSON sidecars, and no readable .qgs canvas extent found in the archive.';
    return { geojson: null, bounds: null, message: hint };
  }

  const parts: string[] = [];
  if (gpkgOk > 0) {
    parts.push(
      `${gpkgOk} GeoPackage${gpkgOk > 1 ? 's' : ''} (${gpkgKeys.length} file${gpkgKeys.length > 1 ? 's' : ''} scanned)`
    );
  }
  if (extentAdded) parts.push('project canvas extent');
  if (gpkgSkipped > 0 && gpkgOk === 0 && !extentAdded) {
    parts.push(`${gpkgSkipped} package(s) had no readable layers`);
  }

  const msg = `Archive “${archiveLabel}”: ${parts.join(' + ')} — ${merged.length} map object(s). Layers use GeoJSON properties package, layer, and source.`;

  return {
    geojson: { type: 'FeatureCollection', features: merged },
    bounds: unionBounds,
    message: msg,
  };
}

export async function extractQfieldMapPreviewFromBytes(
  fileName: string,
  bytes: Uint8Array
): Promise<QFieldMapPreviewResult> {
  const lower = fileName.toLowerCase();
  if (bytes.length > MAX_BYTES) {
    return { geojson: null, bounds: null, message: 'File too large for server map preview (max 45MB).' };
  }
  if (lower.endsWith('.gpkg')) {
    return previewFromGpkg(bytes, fileName.split('/').pop() ?? fileName);
  }
  if (lower.endsWith('.qgz') || lower.endsWith('.zip')) {
    return previewFromZipArchive(bytes, fileName.split('/').pop() ?? fileName);
  }
  if (lower.endsWith('.qgs')) {
    try {
      const xml = new TextDecoder('utf-8').decode(bytes);
      const bounds = parseQgsCanvasExtent(xml);
      if (!bounds) {
        return { geojson: null, bounds: null, message: 'No canvas extent found in .qgs file.' };
      }
      return {
        geojson: {
          type: 'FeatureCollection',
          features: [boundsToPolygonFeature(bounds, { projectFile: fileName })],
        },
        bounds,
        message: 'Canvas extent from .qgs (approximate).',
      };
    } catch {
      return { geojson: null, bounds: null, message: 'Could not read .qgs as UTF-8 text.' };
    }
  }
  return {
    geojson: null,
    bounds: null,
    message: 'Map preview supports .gpkg, .qgz, .zip (embedded .gpkg + optional .geojson/.json FeatureCollections + optional .qgs), or plain .qgs.',
  };
}

export function resolveTicketAssetAbsoluteUrl(url: string): string {
  const u = (url || '').trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000';
  const origin = base.replace(/\/$/, '');
  return u.startsWith('/') ? `${origin}${u}` : `${origin}/${u}`;
}
