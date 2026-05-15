/**
 * Best-effort map preview for QField packages: GeoPackage vectors, or QGIS canvas extent from .qgz / .zip.
 * ZIP / QGZ archives are fully unpacked: every embedded .gpkg is read and vector layers merged into one GeoJSON.
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
    const stmt = db.prepare(
      'SELECT table_name AS t, column_name AS c FROM gpkg_geometry_columns LIMIT 16'
    );
    const tables: { t: string; c: string }[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { t?: string; c?: string };
      if (row.t && row.c) tables.push({ t: String(row.t), c: String(row.c) });
    }
    stmt.free();

    if (tables.length === 0) {
      db.close();
      return { features: [], bounds: null };
    }

    const perTableLimit = Math.max(20, Math.ceil(opts.maxFeatures / Math.max(1, tables.length)));

    for (const { t: table, c: geomCol } of tables) {
      if (features.length >= opts.maxFeatures) break;
      if (table.startsWith('gpkg_') || table.startsWith('rtree_')) continue;
      const safeTable = table.replace(/"/g, '""');
      const safeCol = geomCol.replace(/"/g, '""');
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
        try {
          const geom = wkx.Geometry.parse(buf).toGeoJSON() as GeoJsonGeometry | null;
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
        } catch {
          /* invalid WKB */
        }
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
        ? 'Archive contained .gpkg file(s) but no readable vector geometries (CRS or empty tables).'
        : 'No .gpkg layers and no readable .qgs canvas extent found in the archive.';
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
    message: 'Map preview supports .gpkg, .qgz, .zip (embedded .gpkg + optional .qgs), or plain .qgs.',
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
