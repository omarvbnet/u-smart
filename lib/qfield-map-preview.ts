/**
 * Best-effort map preview for QField packages: GeoPackage vectors, or QGIS canvas extent from .qgz / .zip.
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
const MAX_FEATURES = 400;

function isFiniteCoord(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= 1e7;
}

function inWgsLikeRange(lon: number, lat: number): boolean {
  return Math.abs(lon) <= 180.01 && Math.abs(lat) <= 90.01;
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

function boundsToPolygonFeature(bounds: QFieldMapBounds): GeoJsonFeature {
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
    properties: { kind: 'qgis_project_extent' },
    geometry: geom,
  };
}

function previewFromZipLike(bytes: Uint8Array, fileName: string): QFieldMapPreviewResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: () => true }) as Record<string, Uint8Array>;
  } catch {
    return { geojson: null, bounds: null, message: 'Could not read archive (zip/qgz).' };
  }
  const keys = Object.keys(files);
  const qgsKey = keys.find((k) => k.toLowerCase().endsWith('.qgs') && !k.toLowerCase().includes('backup'));
  if (!qgsKey) {
    return {
      geojson: null,
      bounds: null,
      message: 'No .qgs project found inside the archive for canvas extent.',
    };
  }
  let xml: string;
  try {
    xml = strFromU8(files[qgsKey], true);
  } catch {
    return { geojson: null, bounds: null, message: 'Could not decode QGIS project file.' };
  }
  const bounds = parseQgsCanvasExtent(xml);
  if (!bounds) {
    return {
      geojson: null,
      bounds: null,
      message: 'Could not find <extent> in the QGIS project (try a GeoPackage layer export).',
    };
  }
  const fc: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features: [boundsToPolygonFeature(bounds)],
  };
  return { geojson: fc, bounds, message: `Canvas extent from ${qgsKey.split('/').pop() ?? 'project'} (approximate).` };
}

async function previewFromGpkg(bytes: Uint8Array): Promise<QFieldMapPreviewResult> {
  try {
    const initSqlJs = (await import('sql.js')).default;
    const wkxMod = await import('wkx');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wkx = wkxMod as any;
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
    const db = new SQL.Database(bytes);
    const stmt = db.prepare(
      'SELECT table_name AS t, column_name AS c FROM gpkg_geometry_columns LIMIT 8'
    );
    const tables: { t: string; c: string }[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { t?: string; c?: string };
      if (row.t && row.c) tables.push({ t: String(row.t), c: String(row.c) });
    }
    stmt.free();
    if (tables.length === 0) {
      db.close();
      return { geojson: null, bounds: null, message: 'GeoPackage has no vector layers (gpkg_geometry_columns).' };
    }

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

    for (const { t: table, c: geomCol } of tables) {
      if (features.length >= MAX_FEATURES) break;
      if (table.startsWith('gpkg_') || table.startsWith('rtree_')) continue;
      const safeTable = table.replace(/"/g, '""');
      const safeCol = geomCol.replace(/"/g, '""');
      const q = `SELECT "${safeCol}" AS g FROM "${safeTable}" WHERE "${safeCol}" IS NOT NULL LIMIT 120`;
      let s: ReturnType<typeof db.prepare>;
      try {
        s = db.prepare(q);
      } catch {
        continue;
      }
      while (s.step()) {
        if (features.length >= MAX_FEATURES) break;
        const row = s.getAsObject() as { g?: Uint8Array | ArrayBuffer };
        const raw = row.g;
        if (!raw) continue;
        const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        if (buf.length < 5) continue;
        try {
          const geom = wkx.Geometry.parse(buf).toGeoJSON() as GeoJsonGeometry | null;
          if (!geom) continue;
          expandFromGeometry(geom);
          features.push({
            type: 'Feature',
            properties: { layer: table },
            geometry: geom,
          });
        } catch {
          /* invalid WKB / empty */
        }
      }
      s.free();
    }

    db.close();

    if (features.length === 0) {
      return { geojson: null, bounds: null, message: 'No readable geometries in GeoPackage (CRS may be non‑WGS84).' };
    }

    const bounds: QFieldMapBounds | null =
      west !== Infinity && south !== Infinity && east !== -Infinity && north !== -Infinity
        ? { west, south, east, north }
        : null;

    return {
      geojson: { type: 'FeatureCollection', features },
      bounds,
      message: `Showing up to ${features.length} features (WGS84 assumed; verify in QField if misaligned).`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GeoPackage preview failed';
    return { geojson: null, bounds: null, message: msg };
  }
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
    return previewFromGpkg(bytes);
  }
  if (lower.endsWith('.qgz') || lower.endsWith('.zip')) {
    return previewFromZipLike(bytes, fileName);
  }
  if (lower.endsWith('.qgs')) {
    try {
      const xml = new TextDecoder('utf-8').decode(bytes);
      const bounds = parseQgsCanvasExtent(xml);
      if (!bounds) {
        return { geojson: null, bounds: null, message: 'No canvas extent found in .qgs file.' };
      }
      return {
        geojson: { type: 'FeatureCollection', features: [boundsToPolygonFeature(bounds)] },
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
    message: 'Map preview supports .gpkg, .qgz, .zip (with .qgs), or plain .qgs.',
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
