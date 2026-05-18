/**
 * Best-effort map preview for QField packages: GeoPackage vectors (correct GeoPackage BLOB → WKB),
 * ESRI Shapefile (.shp) lines/polygons/points, GeoJSON sidecars, or QGIS canvas extent from .qgz / .zip.
 * ZIP bundles may include both `layers.gpkg` and nested `.qgz` (QGIS project archives); nested `.qgz`
 * are opened and their inner `.gpkg` / `.shp` / `.qgs` / GeoJSON are merged into one preview.
 * Canvas extent from `.qgs` is appended only when no vector features were extracted (extent is often in
 * project CRS and would otherwise appear as a lone rectangle on the basemap).
 * Non‑WGS84 geometries (e.g. Iraq UTM) are reprojected to EPSG:4326 when SRS is known or UTM can be inferred.
 */

import { gunzipSync, strFromU8, unzipSync } from 'fflate';
import {
  enrichRowsWithWgs84,
  geometryNeedsReproject,
  loadGpkgSpatialRefs,
  proj4SourceForTable,
  reprojectGeoJsonToWgs84Auto,
} from '@/lib/coordinate-transform';

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

export type QFieldMapLayerSummary = {
  layer: string;
  package: string;
  packagePath?: string;
  featureCount: number;
  geometryTypes: string[];
};

export type QFieldDataTableRow = Record<string, string | number | boolean | null>;

export type QFieldDataTable = {
  name: string;
  package: string;
  packagePath?: string;
  columns: string[];
  rows: QFieldDataTableRow[];
  rowCount: number;
  hasGeometry: boolean;
};

export type QFieldMapPreviewResult = {
  geojson: GeoJsonFeatureCollection | null;
  bounds: QFieldMapBounds | null;
  layers?: QFieldMapLayerSummary[];
  dataTables?: QFieldDataTable[];
  message?: string;
};

const MAX_BYTES = 45 * 1024 * 1024;
const MAX_FEATURES_TOTAL = 800;
const MAX_DATA_TABLE_ROWS = 200;
const MAX_DATA_TABLES = 48;

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
 * SpatiaLite internal BLOB: START 0x00, endian, SRID, MBR, 0x7C, then WKB type + payload (not prefixed
 * with a second endian byte). Trailing 0xFE is stripped. @see gaia-gis SpatiaLite BLOB-Geometry.
 */
function spatialiteInternalBlobToWkb(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 44) return null;
  if (buf[0] !== 0x00) return null;
  const endianMark = buf[1];
  if (endianMark !== 0x00 && endianMark !== 0x01 && endianMark !== 0x80 && endianMark !== 0x81) {
    return null;
  }
  if (buf[38] !== 0x7c) return null;

  let end = buf.length;
  if (end > 0 && buf[end - 1] === 0xfe) end -= 1;
  const body = buf.subarray(39, end);
  if (body.length < 5) return null;

  const readU32 = (le: boolean): number => {
    const v = new DataView(body.buffer, body.byteOffset, body.byteLength);
    return v.getUint32(0, le);
  };
  const le = endianMark === 0x01 || endianMark === 0x81;
  const gtype = readU32(le);
  if (gtype >= 1000000) return null;

  const wkbEndian: 0 | 1 = le ? 1 : 0;
  const out = new Uint8Array(1 + body.length);
  out[0] = wkbEndian;
  out.set(body, 1);
  return out;
}

/**
 * Strip GeoPackage binary header so WKB parsers (wkx) receive standard geometry bytes.
 * @see https://www.geopackage.org/spec/#gpb_format
 */
function geopackageBlobToWkb(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 9) return null;
  const isGpkgHeader =
    buf[0] === GPKG_GEOM_MAGIC[0] && buf[1] === GPKG_GEOM_MAGIC[1];
  if (!isGpkgHeader) {
    const sl = spatialiteInternalBlobToWkb(buf);
    if (sl) return sl;
    // Plain OGC WKB (first byte is 0 or 1 = endianness) — not SpatiaLite (byte0 is also 0x00 there)
    if (buf.length >= 39 && buf[0] === 0x00 && buf[38] === 0x7c) return null;
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

/**
 * Parse SQLite / GeoPackage / SpatiaLite geometry BLOB to GeoJSON (WKB + GeoPackage envelope + byte scan).
 */
function parseGeometryBlobToGeoJson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wkx: any,
  buf: Uint8Array
): GeoJsonGeometry | null {
  const tryParse = (chunk: Uint8Array): GeoJsonGeometry | null => {
    if (!chunk || chunk.length < 5) return null;
    try {
      const g = wkx.Geometry.parse(chunk).toGeoJSON() as GeoJsonGeometry | null;
      return g || null;
    } catch {
      return null;
    }
  };

  const wkbStripped = geopackageBlobToWkb(buf);
  if (wkbStripped) {
    const a = tryParse(wkbStripped);
    if (a) return a;
  }
  const b = tryParse(buf);
  if (b) return b;

  const scanEnd = Math.min(192, buf.length - 9);
  for (let i = 0; i <= scanEnd; i++) {
    if (buf[i] !== 0 && buf[i] !== 1) continue;
    const g = tryParse(buf.subarray(i));
    if (g) return g;
  }
  return null;
}

function parseWktCoordinatePairs(inner: string): [number, number][] {
  const out: [number, number][] = [];
  for (const ch of inner.split(',')) {
    const parts = ch.trim().split(/\s+/);
    const x = parseFloat(parts[0] ?? '');
    const y = parseFloat(parts[1] ?? '');
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

/** QGIS / SQLite may store geometries as WKT in TEXT columns. */
function tryParseWktGeometry(wkt: string): GeoJsonGeometry | null {
  const s = wkt.trim();
  if (!s.length) return null;
  if (/^POINT(?:\s+Z|\s+M|\s+ZM)?\s+EMPTY$/i.test(s)) return null;

  let m = /^POINT(?:\s+Z|\s+M|\s+ZM)?\(\s*([-0-9.eE+]+)\s+([-0-9.eE+]+)/i.exec(s);
  if (m) {
    const x = parseFloat(m[1]!);
    const y = parseFloat(m[2]!);
    if (Number.isFinite(x) && Number.isFinite(y)) return { type: 'Point', coordinates: [x, y] };
  }

  m = /^LINESTRING(?:\s+Z|\s+M|\s+ZM)?\s*\(\s*(.+)\s*\)\s*$/i.exec(s);
  if (m) {
    const coords = parseWktCoordinatePairs(m[1]!);
    if (coords.length >= 2) return { type: 'LineString', coordinates: coords };
  }

  m = /^POLYGON(?:\s+Z|\s+M|\s+ZM)?\s*\(\s*\(\s*(.+)\s*\)\s*\)\s*$/i.exec(s);
  if (m) {
    const coords = parseWktCoordinatePairs(m[1]!);
    if (coords.length >= 3) {
      const a = coords[0]!;
      const b = coords[coords.length - 1]!;
      if (a[0] !== b[0] || a[1] !== b[1]) coords.push([a[0], a[1]]);
      return { type: 'Polygon', coordinates: [coords] };
    }
  }

  m = /^POLYGON(?:\s+Z|\s+M|\s+ZM)?\s*\(\s*([^()]+)\s*\)\s*$/i.exec(s);
  if (m) {
    const coords = parseWktCoordinatePairs(m[1]!);
    if (coords.length >= 3) {
      const a = coords[0]!;
      const b = coords[coords.length - 1]!;
      if (a[0] !== b[0] || a[1] !== b[1]) coords.push([a[0], a[1]]);
      return { type: 'Polygon', coordinates: [coords] };
    }
  }

  return null;
}

/** QGIS .qgz is normally a ZIP (PK…); some builds gzip-wrap an inner ZIP. */
function tryUnzipArchiveBytes(data: Uint8Array): Record<string, Uint8Array> | null {
  if (!data || data.length < 22) return null;
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  const isGzip = data[0] === 0x1f && data[1] === 0x8b;
  if (isZip) {
    try {
      return unzipSync(data, { filter: () => true }) as Record<string, Uint8Array>;
    } catch {
      return null;
    }
  }
  if (isGzip) {
    try {
      const dec = gunzipSync(data);
      if (dec.length >= 22 && dec[0] === 0x50 && dec[1] === 0x4b) {
        return unzipSync(dec, { filter: () => true }) as Record<string, Uint8Array>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Unpack every `.qgz` in the tree (outer ZIP already unzipped) so paths like
 * `export.qgz/project.qgs` and `export.qgz/layers.gpkg` exist alongside root `layers.gpkg`.
 */
function expandNestedQgz(
  initial: Record<string, Uint8Array>,
  maxRounds = 8
): { files: Record<string, Uint8Array>; qgzOpened: number } {
  let out: Record<string, Uint8Array> = { ...initial };
  let qgzOpened = 0;
  for (let round = 0; round < maxRounds; round++) {
    let added = false;
    const additions: Record<string, Uint8Array> = {};
    for (const path of Object.keys(out)) {
      if (!path.toLowerCase().endsWith('.qgz')) continue;
      const data = out[path];
      if (!data || data.length < 22) continue;
      const prefix = path.replace(/\\/g, '/') + '/';
      if (Object.keys(out).some((k) => k !== path && k.startsWith(prefix))) continue;
      const inner = tryUnzipArchiveBytes(data);
      if (!inner || Object.keys(inner).length === 0) continue;
      qgzOpened++;
      added = true;
      for (const [ik, iv] of Object.entries(inner)) {
        additions[`${prefix}${ik.replace(/\\/g, '/')}`] = iv;
      }
    }
    if (!added) break;
    out = { ...out, ...additions };
  }
  return { files: out, qgzOpened };
}

function pickQgsExtentKey(keys: string[]): string | undefined {
  const qgs = keys
    .filter((k) => k.toLowerCase().endsWith('.qgs') && !k.toLowerCase().includes('backup'))
    .sort((a, b) => a.length - b.length);
  const preferred = qgs.find((k) => /(^|\/)project\.qgs$/i.test(k.replace(/\\/g, '/')));
  return preferred ?? qgs[0];
}

/** Prefer vectors inside unpacked `.qgz/` (project data) before short root paths. */
function sortArchivePathsForVectors(a: string, b: string): number {
  const pa = a.replace(/\\/g, '/').toLowerCase().includes('.qgz/');
  const pb = b.replace(/\\/g, '/').toLowerCase().includes('.qgz/');
  if (pa !== pb) return pa ? -1 : 1;
  return a.length - b.length;
}

function readInt32BE(buf: Uint8Array, off: number): number {
  return (
    (buf[off]! << 24) | (buf[off + 1]! << 16) | (buf[off + 2]! << 8) | buf[off + 3]!
  );
}

function readInt32LE(buf: Uint8Array, off: number): number {
  return new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
}

function readFloat64LE(buf: Uint8Array, off: number): number {
  return new DataView(buf.buffer, buf.byteOffset + off, 8).getFloat64(0, true);
}

const SHP_MAGIC = 9994;

/**
 * Parse ESRI .dbf attribute table (dBASE III / IV subset used by shapefiles).
 */
function parseDbfAttributeRows(dbf: Uint8Array): QFieldDataTableRow[] {
  const rows: QFieldDataTableRow[] = [];
  if (dbf.length < 32) return rows;
  const view = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const numRecords = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  if (headerLen < 33 || recordLen < 2 || headerLen >= dbf.length) return rows;

  type DbfField = { name: string; type: string; len: number; dec: number; offset: number };
  const fields: DbfField[] = [];
  let off = 32;
  while (off + 32 <= headerLen && dbf[off] !== 0x0d) {
    let name = '';
    for (let i = 0; i < 11; i++) {
      const c = dbf[off + i]!;
      if (c === 0) break;
      name += String.fromCharCode(c);
    }
    name = name.trim();
    const type = String.fromCharCode(dbf[off + 11]!);
    const len = dbf[off + 16]!;
    const dec = dbf[off + 17]!;
    if (name) fields.push({ name, type, len, dec, offset: 0 });
    off += 32;
  }
  if (fields.length === 0) return rows;

  let fieldOff = 1;
  for (const f of fields) {
    f.offset = fieldOff;
    fieldOff += f.len;
  }

  const maxRows = Math.min(numRecords, MAX_DATA_TABLE_ROWS);
  let recOff = headerLen;
  for (let r = 0; r < maxRows && recOff + recordLen <= dbf.length; r++) {
    if (dbf[recOff] === 0x2a) {
      recOff += recordLen;
      continue;
    }
    const row: QFieldDataTableRow = {};
    for (const f of fields) {
      const start = recOff + f.offset;
      const slice = dbf.subarray(start, start + f.len);
      let text = new TextDecoder('latin1').decode(slice).trim();
      if (f.type === 'N' || f.type === 'F') {
        const n = parseFloat(text.replace(',', '.'));
        row[f.name] = Number.isFinite(n) ? n : text || null;
      } else if (f.type === 'L') {
        const u = text.toUpperCase();
        row[f.name] = u === 'T' || u === 'Y' ? true : u === 'F' || u === 'N' ? false : null;
      } else {
        row[f.name] = text || null;
      }
    }
    rows.push(row);
    recOff += recordLen;
  }
  return rows;
}

/**
 * Minimal ESRI Shapefile geometry scan (routes / lines / polygons) with optional .dbf attributes.
 */
function extractEsriShapefileFeatures(
  bytes: Uint8Array,
  opts: { maxFeatures: number; packagePath: string; dbfBytes?: Uint8Array }
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
  const shortName = opts.packagePath.split('/').pop() ?? opts.packagePath;

  if (bytes.length < 112) return { features: [], bounds: null };
  if (readInt32BE(bytes, 0) !== SHP_MAGIC) return { features: [], bounds: null };

  const fileWords = readInt32BE(bytes, 24);
  const fileLen = fileWords * 2;
  if (fileLen < 100 || fileLen > bytes.length) return { features: [], bounds: null };

  let off = 100;
  const maxPtsPerGeom = 8000;
  const dbfRows = opts.dbfBytes ? parseDbfAttributeRows(opts.dbfBytes) : [];
  let dbfIndex = 0;

  while (off + 8 <= bytes.length && features.length < opts.maxFeatures) {
    const contentWords = readInt32BE(bytes, off + 4);
    const contentBytes = contentWords * 2;
    off += 8;
    if (contentBytes < 4 || off + contentBytes > bytes.length) break;
    const recEnd = off + contentBytes;
    const shapeType = readInt32LE(bytes, off);

    let geom: GeoJsonGeometry | null = null;
    if (shapeType === 1) {
      if (contentBytes >= 20) {
        const x = readFloat64LE(bytes, off + 4);
        const y = readFloat64LE(bytes, off + 12);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          expandBounds(x, y);
          geom = { type: 'Point', coordinates: [x, y] };
        }
      }
    } else if (shapeType === 3 || shapeType === 13) {
      const base = off + 4;
      if (contentBytes < 44) {
        off = recEnd;
        continue;
      }
      const numParts = readInt32LE(bytes, base + 32);
      const numPoints = readInt32LE(bytes, base + 36);
      if (numParts < 1 || numPoints < 2 || numParts > 50000 || numPoints > 500000) {
        off = recEnd;
        continue;
      }
      let idx = base + 40;
      const partIdx: number[] = [];
      for (let p = 0; p < numParts; p++) {
        partIdx.push(readInt32LE(bytes, idx));
        idx += 4;
      }
      const xyStart = idx;
      const lines: [number, number][][] = [];
      for (let p = 0; p < numParts; p++) {
        const start = partIdx[p] ?? 0;
        const end = p + 1 < numParts ? partIdx[p + 1]! : numPoints;
        const cap = Math.min(end, start + maxPtsPerGeom);
        const ring: [number, number][] = [];
        for (let i = start; i < cap; i++) {
          const o = xyStart + i * 16;
          if (o + 16 > recEnd) break;
          const x = readFloat64LE(bytes, o);
          const y = readFloat64LE(bytes, o + 8);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            expandBounds(x, y);
            ring.push([x, y]);
          }
        }
        if (ring.length >= 2) lines.push(ring);
      }
      if (lines.length === 1) geom = { type: 'LineString', coordinates: lines[0]! };
      else if (lines.length > 1) geom = { type: 'MultiLineString', coordinates: lines };
    } else if (shapeType === 5 || shapeType === 15) {
      const base = off + 4;
      if (contentBytes < 44) {
        off = recEnd;
        continue;
      }
      const numParts = readInt32LE(bytes, base + 32);
      const numPoints = readInt32LE(bytes, base + 36);
      if (numParts < 1 || numPoints < 3 || numParts > 50000 || numPoints > 500000) {
        off = recEnd;
        continue;
      }
      let idx = base + 40;
      const partIdx: number[] = [];
      for (let p = 0; p < numParts; p++) {
        partIdx.push(readInt32LE(bytes, idx));
        idx += 4;
      }
      const xyStart = idx;
      const rings: [number, number][][] = [];
      for (let p = 0; p < numParts; p++) {
        const start = partIdx[p] ?? 0;
        const end = p + 1 < numParts ? partIdx[p + 1]! : numPoints;
        const cap = Math.min(end, start + maxPtsPerGeom);
        const ring: [number, number][] = [];
        for (let i = start; i < cap; i++) {
          const o = xyStart + i * 16;
          if (o + 16 > recEnd) break;
          const x = readFloat64LE(bytes, o);
          const y = readFloat64LE(bytes, o + 8);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            expandBounds(x, y);
            ring.push([x, y]);
          }
        }
        if (ring.length >= 3) {
          const a = ring[0]!;
          const b = ring[ring.length - 1]!;
          if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
          rings.push(ring);
        }
      }
      if (rings.length === 1) geom = { type: 'Polygon', coordinates: rings };
      else if (rings.length > 1) geom = { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
    }

    if (geom) {
      const attrs = dbfRows[dbfIndex] ?? {};
      features.push({
        type: 'Feature',
        properties: {
          layer: shortName.replace(/\.shp$/i, ''),
          package: shortName,
          packagePath: opts.packagePath,
          source: 'shapefile',
          ...attrs,
        },
        geometry: geom,
      });
    }
    dbfIndex += 1;
    off = recEnd;
  }

  const bounds: QFieldMapBounds | null =
    west !== Infinity && south !== Infinity && east !== -Infinity && north !== -Infinity
      ? { west, south, east, north }
      : null;

  return { features, bounds };
}

async function initSqlJsForGeopackage() {
  const initSqlJs = (await import('sql.js')).default;
  const opts: Parameters<typeof initSqlJs>[0] = {};
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { createRequire } = await import('node:module');
    const loadWasmFile = (wasmPath: string): boolean => {
      try {
        const raw = readFileSync(wasmPath);
        const u8 = new Uint8Array(raw);
        opts.wasmBinary = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        return true;
      } catch {
        return false;
      }
    };
    let loaded = false;
    if (loadWasmFile(join(process.cwd(), 'public', 'vendor', 'sql-wasm.wasm'))) loaded = true;
    for (const base of [join(process.cwd(), 'package.json'), join(process.cwd(), '..', 'package.json')]) {
      if (loaded) break;
      try {
        const require = createRequire(base);
        const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
        loaded = loadWasmFile(wasmPath);
      } catch {
        /* try next */
      }
    }
    if (!loaded) {
      loaded = loadWasmFile(join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
    }
    if (!loaded) {
      try {
        const require = createRequire(join(process.cwd(), 'package.json'));
        const { version } = require('sql.js/package.json') as { version: string };
        const url = `https://unpkg.com/sql.js@${version}/dist/sql-wasm.wasm`;
        const r = await fetch(url, { redirect: 'follow' });
        if (r.ok) {
          const ab = await r.arrayBuffer();
          const u8 = new Uint8Array(ab);
          opts.wasmBinary = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
          loaded = true;
        }
      } catch {
        /* */
      }
    }
    if (!loaded) {
      let ver = '1.14.1';
      try {
        const require = createRequire(join(process.cwd(), 'package.json'));
        ver = (require('sql.js/package.json') as { version: string }).version;
      } catch {
        /* */
      }
      opts.locateFile = (file: string) => `https://unpkg.com/sql.js@${ver}/dist/${file}`;
    }
  } else {
    opts.locateFile = (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}`;
  }
  return initSqlJs(opts);
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

function normArchiveKey(s: string): string {
  return s.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function normalizeRelativePathSegments(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function buildNormKeyToOriginal(keys: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of keys) {
    const n = normArchiveKey(k);
    if (!m.has(n)) m.set(n, k);
  }
  return m;
}

function resolveQgsVectorPathToArchiveKey(
  qgsDirNorm: string,
  pathPartRaw: string,
  normToOriginal: Map<string, string>
): string | null {
  let p = pathPartRaw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim();
  if (!p || /^https?:\/\//i.test(p)) return null;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* */
  }
  p = p.replace(/^file:\/\//i, '');
  if (/^[a-z]:[/\\]/i.test(p)) p = p.replace(/\\/g, '/');
  p = p.replace(/\\/g, '/');
  const combined =
    qgsDirNorm && !p.startsWith('/') && !/^[a-z]:\//i.test(p)
      ? normalizeRelativePathSegments(`${qgsDirNorm}/${p.replace(/^\.\//, '')}`)
      : normalizeRelativePathSegments(p.replace(/^\.\//, ''));
  if (normToOriginal.has(combined)) return normToOriginal.get(combined)!;
  for (const [nk, orig] of normToOriginal) {
    if (nk === combined || nk.endsWith(`/${combined}`)) return orig;
  }
  const leaf = combined.split('/').pop() ?? combined;
  const hits: string[] = [];
  for (const [nk, orig] of normToOriginal) {
    if (nk === leaf || nk.endsWith(`/${leaf}`)) hits.push(orig);
  }
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) {
    const prefer = hits.find((o) => normArchiveKey(o).startsWith(qgsDirNorm));
    return prefer ?? hits[0]!;
  }
  return null;
}

/** First file path to .gpkg / .shp / .sqlite / .db inside a QGIS <datasource> block. */
function firstVectorFilePathFromDatasourceBlock(raw: string): string | null {
  const noCdata = raw
    .replace(/^\s*<!\[CDATA\[/i, '')
    .replace(/\]\]>\s*$/i, '')
    .trim();
  const main = noCdata.split('|')[0]!.trim();
  const dbnameM = main.match(/dbname\s*=\s*['"]([^'"]+)['"]/i);
  if (dbnameM && /\.(gpkg|shp|sqlite|db)$/i.test(dbnameM[1]!)) return dbnameM[1]!.trim();
  const head = main.replace(/^["']|["']$/g, '').replace(/^file:\/\//i, '').trim();
  if (
    /\.(gpkg|shp|sqlite|db)$/i.test(head) &&
    !/^(postgres|postgresql|service|dbname|http)/i.test(head)
  ) {
    return head;
  }
  const quoted = main.match(/['"]([^'"]+\.(gpkg|shp|sqlite|db))['"]/i);
  if (quoted) return quoted[1]!.trim();
  const bare = main.match(/([^\s'"|<>]+\.(gpkg|shp|sqlite|db))\b/i);
  if (bare) return bare[1]!.replace(/\\/g, '/').trim();
  return null;
}

/**
 * Paths to vector files referenced by any .qgs in the archive (relative paths resolved from each .qgs folder).
 */
function collectQgsDatasourceVectorKeys(
  keys: string[],
  files: Record<string, Uint8Array>
): { gpkg: string[]; shp: string[] } {
  const normToOrig = buildNormKeyToOriginal(keys);
  const gpkg: string[] = [];
  const shp: string[] = [];
  const seenG = new Set<string>();
  const seenS = new Set<string>();
  const pushUnique = (arr: string[], seen: Set<string>, origKey: string) => {
    const n = normArchiveKey(origKey);
    if (seen.has(n) || !files[origKey]) return;
    seen.add(n);
    arr.push(origKey);
  };

  for (const qgk of keys) {
    if (!qgk.toLowerCase().endsWith('.qgs')) continue;
    if (qgk.toLowerCase().includes('backup')) continue;
    const bytes = files[qgk];
    if (!bytes) continue;
    let xml: string;
    try {
      xml = strFromU8(bytes, true);
    } catch {
      continue;
    }
    const qgsDir = normArchiveKey(qgk).replace(/\/[^/]+$/, '');
    const lower = xml.toLowerCase();
    let pos = 0;
    while (pos < xml.length) {
      const a = lower.indexOf('<datasource>', pos);
      if (a === -1) break;
      const b = lower.indexOf('</datasource>', a);
      if (b === -1) break;
      const block = xml.slice(a + '<datasource>'.length, b);
      const pathPart = firstVectorFilePathFromDatasourceBlock(block);
      if (pathPart) {
        const hit = resolveQgsVectorPathToArchiveKey(qgsDir, pathPart, normToOrig);
        if (hit) {
          const low = hit.toLowerCase();
          if (low.endsWith('.shp')) pushUnique(shp, seenS, hit);
          else pushUnique(gpkg, seenG, hit);
        }
      }
      pos = b + 1;
    }
  }
  return { gpkg, shp };
}

function summarizeVectorishFiles(keys: string[]): string {
  const countEnds = (suffix: string) => keys.filter((k) => k.toLowerCase().endsWith(suffix)).length;
  const gpkg = countEnds('.gpkg');
  const shp = countEnds('.shp');
  const sqlite = keys.filter((k) => {
    const x = k.toLowerCase();
    return (x.endsWith('.sqlite') || x.endsWith('.db')) && !x.includes('-wal');
  }).length;
  const gWord =
    gpkg === 0 ? 'no GeoPackage files' : gpkg === 1 ? 'one GeoPackage file' : `${gpkg} GeoPackage files`;
  const sWord =
    shp === 0 ? 'no shapefiles' : shp === 1 ? 'one shapefile' : `${shp} shapefiles`;
  const qWord =
    sqlite === 0
      ? 'no SQLite databases'
      : sqlite === 1
        ? 'one SQLite database'
        : `${sqlite} SQLite databases`;
  return `${gWord}, ${sWord}, ${qWord}`;
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

function sqliteTypeLooksBlobGeometry(typ: string): boolean {
  const u = String(typ).toUpperCase().trim();
  return u === 'BLOB' || u === 'GEOMETRY' || u === '' || u.includes('BLOB');
}

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

  const blobGeomNames = /^(geom|geometry|wkb_geometry|the_geom|shape|Geometry|SHAPE)$/i;
  const looseGeom = /(geom|geometry|wkb|shape)/i;

  const tryTable = (table: string) => {
    if (!table || table.startsWith('gpkg_') || table.startsWith('rtree_') || table.startsWith('idx_'))
      return;
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
      const typ = row.type != null ? String(row.type) : '';
      if (!name) continue;
      const tu = typ.toUpperCase().trim();
      const blobish = sqliteTypeLooksBlobGeometry(typ);
      const textGeom =
        (tu === 'TEXT' || tu === 'VARCHAR' || tu === 'CHARACTER' || tu === 'CLOB') &&
        (blobGeomNames.test(name) || looseGeom.test(name));
      if (!blobish && !textGeom) continue;
      if (blobGeomNames.test(name) || looseGeom.test(name)) {
        add(table, name);
        foundNamed = true;
      } else {
        blobCandidates.push(name);
      }
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

function serializeGpkgAttributeValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return '[binary]';
  return String(value);
}

function listGpkgTableColumns(
  db: { prepare: (sql: string) => { step: () => boolean; getAsObject: () => object; free: () => void } },
  table: string,
  geomCol: string | null,
  quoteId: (ident: string) => string
): string[] {
  const cols: string[] = [];
  const safeTable = quoteId(table);
  try {
    const stmt = db.prepare(`PRAGMA table_info("${safeTable}")`);
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name?: string };
      const name = row.name ? String(row.name) : '';
      if (!name || (geomCol && name === geomCol)) continue;
      cols.push(name);
    }
    stmt.free();
  } catch {
    /* ignore */
  }
  return cols;
}

function isSystemSqlTable(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.startsWith('sqlite_') ||
    n.startsWith('gpkg_') ||
    n.startsWith('rtree_') ||
    n.startsWith('idx_') ||
    n === 'geometry_columns' ||
    n === 'spatial_ref_sys' ||
    n === 'views_geometry_columns' ||
    n === 'virts_geometry_columns'
  );
}

function rowToProperties(
  row: Record<string, unknown>,
  skipKeys: Set<string>
): QFieldDataTableRow {
  const out: QFieldDataTableRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (skipKeys.has(k)) continue;
    out[k] = serializeGpkgAttributeValue(v);
  }
  return out;
}

/**
 * Read all user tables from GeoPackage / SpatiaLite (attribute rows for map layer details).
 */
async function extractGpkgDataTables(
  bytes: Uint8Array,
  opts: { packagePath: string; maxRowsPerTable?: number }
): Promise<QFieldDataTable[]> {
  const tables: QFieldDataTable[] = [];
  const shortName = opts.packagePath.split('/').pop() ?? opts.packagePath;
  const maxRows = opts.maxRowsPerTable ?? MAX_DATA_TABLE_ROWS;

  try {
    const SQL = await initSqlJsForGeopackage();
    const db = new SQL.Database(bytes);
    const quoteId = (ident: string) => ident.replace(/"/g, '""');

    const geomByTable = new Map<string, string>();
    try {
      const stmt = db.prepare(
        'SELECT table_name AS t, column_name AS c FROM gpkg_geometry_columns'
      );
      while (stmt.step()) {
        const row = stmt.getAsObject() as { t?: string; c?: string };
        if (row.t && row.c) geomByTable.set(String(row.t), String(row.c));
      }
      stmt.free();
    } catch {
      /* ignore */
    }

    const { srsById, srsByTable } = loadGpkgSpatialRefs(db, quoteId);

    const tableNames = new Set<string>();
    const listStmt = db.prepare(
      "SELECT name AS n FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'"
    );
    while (listStmt.step()) {
      const row = listStmt.getAsObject() as { n?: string };
      if (row.n && !isSystemSqlTable(String(row.n))) tableNames.add(String(row.n));
    }
    listStmt.free();

    try {
      const gcStmt = db.prepare(
        "SELECT DISTINCT table_name AS n FROM gpkg_contents WHERE typeof(table_name)='text' AND data_type IN ('features','tiles','attributes')"
      );
      while (gcStmt.step()) {
        const row = gcStmt.getAsObject() as { n?: string };
        if (row.n && !isSystemSqlTable(String(row.n))) tableNames.add(String(row.n));
      }
      gcStmt.free();
    } catch {
      /* ignore */
    }

    for (const table of tableNames) {
      if (tables.length >= MAX_DATA_TABLES) break;
      const geomCol = geomByTable.get(table) ?? null;
      const attrCols = listGpkgTableColumns(db, table, geomCol, quoteId);

      const safeTable = quoteId(table);
      const rows: QFieldDataTableRow[] = [];
      let columns = attrCols;

      if (attrCols.length > 0) {
        const selectList = attrCols.map((c) => `"${quoteId(c)}"`);
        const q = `SELECT ${selectList.join(', ')} FROM "${safeTable}" LIMIT ${maxRows}`;
        try {
          const s = db.prepare(q);
          while (s.step()) {
            const row = s.getAsObject() as Record<string, unknown>;
            rows.push(rowToProperties(row, new Set()));
          }
          s.free();
        } catch {
          /* try count-only below */
        }
      }

      const totalRows = countSqliteTableRows(db, table, quoteId);
      const rowCount = Math.max(rows.length, totalRows);
      if (rowCount === 0) continue;

      if (columns.length === 0 && geomCol) {
        columns = ['(geometry column only)'];
      }

      const { fromProj, epsg } = proj4SourceForTable(table, srsById, srsByTable);
      if (rows.length > 0) {
        enrichRowsWithWgs84(rows, fromProj, epsg);
        if (!columns.includes('latitude') && rows.some((r) => r.latitude != null)) {
          columns = [...columns, 'latitude', 'longitude'];
        }
      }

      tables.push({
        name: table,
        package: shortName,
        packagePath: opts.packagePath,
        columns,
        rows,
        rowCount,
        hasGeometry: geomCol != null,
      });
    }

    db.close();
  } catch {
    /* ignore */
  }

  return tables;
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
    const wkxMod = await import('wkx');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wkx = wkxMod as any;
    const SQL = await initSqlJsForGeopackage();
    const db = new SQL.Database(bytes);

    const quoteId = (ident: string) => ident.replace(/"/g, '""');

    const loadGeometryTables = (): { t: string; c: string }[] => {
      const seen = new Set<string>();
      const tables: { t: string; c: string }[] = [];
      const push = (t: string, c: string) => {
        const k = `${t}\0${c}`;
        if (seen.has(k)) return;
        seen.add(k);
        tables.push({ t, c });
      };
      try {
        const stmt = db.prepare(
          'SELECT table_name AS t, column_name AS c FROM gpkg_geometry_columns'
        );
        while (stmt.step()) {
          const row = stmt.getAsObject() as { t?: string; c?: string };
          if (row.t && row.c) push(String(row.t), String(row.c));
        }
        stmt.free();
      } catch {
        /* not a GeoPackage registry */
      }
      try {
        const stmt = db.prepare(
          "SELECT f_table_name AS t, f_geometry_column AS c FROM geometry_columns WHERE typeof(f_table_name)='text' AND typeof(f_geometry_column)='text' AND f_table_name NOT GLOB 'sqlite*' AND f_table_name NOT GLOB 'idx_*' LIMIT 120"
        );
        while (stmt.step()) {
          const row = stmt.getAsObject() as { t?: string; c?: string };
          if (row.t && row.c) push(String(row.t), String(row.c));
        }
        stmt.free();
      } catch {
        /* not SpatiaLite */
      }
      if (tables.length > 0) return tables;
      return discoverGeometryColumnsFallback(db, quoteId);
    };

    const tables = loadGeometryTables();

    if (tables.length === 0) {
      db.close();
      return { features: [], bounds: null };
    }

    const { srsById, srsByTable } = loadGpkgSpatialRefs(db, quoteId);

    const perTableLimit = Math.max(20, Math.ceil(opts.maxFeatures / Math.max(1, tables.length)));

    for (const { t: table, c: geomCol } of tables) {
      if (features.length >= opts.maxFeatures) break;
      if (table.startsWith('gpkg_') || table.startsWith('rtree_') || table.startsWith('idx_')) continue;
      const safeTable = quoteId(table);
      const safeCol = quoteId(geomCol);
      const attrCols = listGpkgTableColumns(db, table, geomCol, quoteId);
      const selectParts = [`"${safeCol}" AS g`, ...attrCols.map((c) => `"${quoteId(c)}" AS "${quoteId(c)}"`)];
      let q = `SELECT ${selectParts.join(', ')} FROM "${safeTable}" WHERE "${safeCol}" IS NOT NULL LIMIT ${perTableLimit}`;
      let s: ReturnType<typeof db.prepare>;
      try {
        s = db.prepare(q);
      } catch {
        q = `SELECT "${safeCol}" AS g FROM "${safeTable}" WHERE "${safeCol}" IS NOT NULL LIMIT ${perTableLimit}`;
        try {
          s = db.prepare(q);
        } catch {
          continue;
        }
      }
      while (s.step()) {
        if (features.length >= opts.maxFeatures) break;
        const row = s.getAsObject() as Record<string, unknown>;
        const raw = row.g;
        if (raw == null) continue;
        let geom: GeoJsonGeometry | null = null;
        if (typeof raw === 'string') {
          geom = tryParseWktGeometry(raw);
        } else if (raw instanceof Uint8Array) {
          if (raw.length >= 5) geom = parseGeometryBlobToGeoJson(wkx, raw);
        } else if (raw instanceof ArrayBuffer) {
          const buf = new Uint8Array(raw);
          if (buf.length >= 5) geom = parseGeometryBlobToGeoJson(wkx, buf);
        }
        if (!geom) continue;

        const { fromProj, epsg } = proj4SourceForTable(table, srsById, srsByTable);
        if (geometryNeedsReproject(geom)) {
          const reproj = reprojectGeoJsonToWgs84Auto(geom, fromProj, epsg);
          if (reproj) geom = reproj;
        }

        expandFromGeometry(geom);
        const properties: Record<string, string | number | boolean | null> = {
          layer: table,
          package: shortName,
          packagePath: opts.packagePath,
          source: 'geopackage',
          ...(epsg != null ? { crsEpsg: epsg } : {}),
          ...rowToProperties(row, new Set(['g'])),
        };
        features.push({
          type: 'Feature',
          properties,
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
  const [{ features, bounds }, dataTables] = await Promise.all([
    extractGpkgVectorFeatures(bytes, {
      maxFeatures: MAX_FEATURES_TOTAL,
      packagePath: displayName,
    }),
    extractGpkgDataTables(bytes, { packagePath: displayName }),
  ]);
  if (features.length === 0 && dataTables.length === 0) {
    return {
      geojson: null,
      bounds: null,
      dataTables: [],
      message: 'No readable geometries or attribute tables in GeoPackage (empty or unsupported format).',
    };
  }
  const layerSummaries = buildLayerSummaries(features, dataTables);
  const tableNote =
    dataTables.length > 0
      ? ` ${dataTables.length} SQL table(s) with up to ${MAX_DATA_TABLE_ROWS} rows each.`
      : '';
  return {
    geojson:
      features.length > 0 ? { type: 'FeatureCollection', features } : null,
    bounds,
    layers: layerSummaries,
    dataTables,
    message:
      features.length > 0
        ? `${features.length} feature(s) from GeoPackage “${displayName}” across ${layerSummaries.length} layer(s).${tableNote}`
        : `No map geometries extracted; ${dataTables.length} attribute table(s) loaded from “${displayName}” (UTM rows reprojected when possible).${tableNote}`,
  };
}

function layerSummaryKey(packageName: string, layerName: string): string {
  return `${packageName}\0${layerName}`;
}

function countSqliteTableRows(db: SqlJsDb, table: string, quoteId: (ident: string) => string): number {
  const safeTable = quoteId(table);
  try {
    const stmt = db.prepare(`SELECT COUNT(*) AS c FROM "${safeTable}"`);
    if (!stmt.step()) {
      stmt.free();
      return 0;
    }
    const row = stmt.getAsObject() as { c?: number | bigint };
    stmt.free();
    const n = row.c;
    if (typeof n === 'bigint') return Number(n);
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Layer list with feature counts from map geometries AND SQL table row counts (whichever is larger).
 */
function buildLayerSummaries(
  features: GeoJsonFeature[],
  dataTables: QFieldDataTable[] = []
): QFieldMapLayerSummary[] {
  const byKey = new Map<string, QFieldMapLayerSummary>();

  for (const f of features) {
    const props = f.properties ?? {};
    const layer = String(props.layer ?? props.name ?? 'layer');
    const pkg = String(props.package ?? props.packagePath ?? '');
    const key = layerSummaryKey(pkg, layer);
    let row = byKey.get(key);
    if (!row) {
      row = {
        layer,
        package: pkg,
        packagePath: typeof props.packagePath === 'string' ? props.packagePath : undefined,
        featureCount: 0,
        geometryTypes: [],
      };
      byKey.set(key, row);
    }
    row.featureCount += 1;
    const gt = f.geometry?.type;
    if (gt && !row.geometryTypes.includes(gt)) row.geometryTypes.push(gt);
  }

  for (const t of dataTables) {
    const layer = t.name.trim() || 'layer';
    const pkg = t.package.trim();
    const count = Math.max(t.rowCount, t.rows.length);
    const key = layerSummaryKey(pkg, layer);
    let row = byKey.get(key);
    if (!row) {
      row = {
        layer,
        package: pkg,
        packagePath: t.packagePath,
        featureCount: 0,
        geometryTypes: [],
      };
      byKey.set(key, row);
    }
    row.featureCount = Math.max(row.featureCount, count);
    const gt = t.hasGeometry ? 'SQL' : 'Attributes';
    if (!row.geometryTypes.includes(gt)) row.geometryTypes.push(gt);
  }

  return [...byKey.values()].sort((a, b) =>
    a.package === b.package ? a.layer.localeCompare(b.layer) : a.package.localeCompare(b.package)
  );
}

async function previewFromZipArchive(bytes: Uint8Array, archiveLabel: string): Promise<QFieldMapPreviewResult> {
  const unzipped = tryUnzipArchiveBytes(bytes);
  if (!unzipped || Object.keys(unzipped).length === 0) {
    return { geojson: null, bounds: null, message: 'Could not read archive (zip/qgz).' };
  }
  let files = unzipped;

  const outerHadQgz = Object.keys(files).some((k) => k.toLowerCase().endsWith('.qgz'));
  const expanded = expandNestedQgz(files);
  files = expanded.files;
  const qgzNestedOpened = expanded.qgzOpened;

  const keys = Object.keys(files);
  const refVec = collectQgsDatasourceVectorKeys(keys, files);

  const gpkgKeys = keys
    .filter((k) => k.toLowerCase().endsWith('.gpkg'))
    .sort(sortArchivePathsForVectors);

  const sqliteVectorKeys = keys
    .filter((k) => {
      const x = k.toLowerCase();
      return (x.endsWith('.sqlite') || x.endsWith('.db')) && !x.includes('-wal');
    })
    .sort(sortArchivePathsForVectors);

  const shpKeysAll = keys
    .filter((k) => k.toLowerCase().endsWith('.shp'))
    .sort(sortArchivePathsForVectors);

  const nk = (s: string) => normArchiveKey(s);
  const gpkgKeysOrdered = [
    ...refVec.gpkg,
    ...gpkgKeys.filter((k) => !refVec.gpkg.some((r) => nk(r) === nk(k))),
    ...sqliteVectorKeys.filter(
      (k) =>
        !refVec.gpkg.some((r) => nk(r) === nk(k)) && !gpkgKeys.some((g) => nk(g) === nk(k))
    ),
  ];
  const shpKeysOrdered = [
    ...refVec.shp,
    ...shpKeysAll.filter((k) => !refVec.shp.some((r) => nk(r) === nk(k))),
  ];

  const merged: GeoJsonFeature[] = [];
  const allDataTables: QFieldDataTable[] = [];
  let unionBounds: QFieldMapBounds | null = null;
  let remaining = MAX_FEATURES_TOTAL;
  let gpkgOk = 0;
  let gpkgSkipped = 0;
  let shpOk = 0;
  let shpSkipped = 0;

  if (gpkgKeysOrdered.length > 0) {
    const divisor = Math.min(gpkgKeysOrdered.length + shpKeysOrdered.length, 8);
    const budgetEach = Math.max(40, Math.floor(MAX_FEATURES_TOTAL / Math.max(1, divisor)));
    for (const path of gpkgKeysOrdered) {
      if (remaining <= 0 && allDataTables.length >= MAX_DATA_TABLES) break;
      const take = Math.min(remaining, budgetEach);
      const gBytes = files[path];
      if (!gBytes || gBytes.length < 64) {
        gpkgSkipped++;
        continue;
      }
      const normPath = path.replace(/\\/g, '/');
      const [vectorResult, dataTables] = await Promise.all([
        extractGpkgVectorFeatures(gBytes, {
          maxFeatures: take,
          packagePath: normPath,
        }),
        extractGpkgDataTables(gBytes, { packagePath: normPath }),
      ]);
      if (dataTables.length > 0) allDataTables.push(...dataTables);
      const { features, bounds } = vectorResult;
      if (features.length > 0) {
        merged.push(...features);
        gpkgOk++;
        unionBounds = mergeBounds(unionBounds, bounds);
        remaining -= features.length;
      } else if (dataTables.length === 0) {
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
      .sort(sortArchivePathsForVectors);

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

  if (remaining > 0 && shpKeysOrdered.length > 0) {
    const divisor = Math.min(shpKeysOrdered.length, 6);
    const budgetEach = Math.max(25, Math.ceil(remaining / Math.max(1, divisor)));
    for (const path of shpKeysOrdered) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, budgetEach);
      const sBytes = files[path];
      if (!sBytes || sBytes.length < 112) {
        shpSkipped++;
        continue;
      }
      const normPath = path.replace(/\\/g, '/');
      const dbfKey = normPath.replace(/\.shp$/i, '.dbf');
      const dbfBytes =
        files[dbfKey] ??
        files[dbfKey.replace(/\//g, '\\')] ??
        files[dbfKey.split('/').pop() ?? ''];
      const { features: shpFeats, bounds: shpBounds } = extractEsriShapefileFeatures(sBytes, {
        maxFeatures: take,
        packagePath: normPath,
        dbfBytes,
      });
      if (shpFeats.length > 0) {
        merged.push(...shpFeats);
        shpOk++;
        unionBounds = mergeBounds(unionBounds, shpBounds);
        remaining -= shpFeats.length;
        if (dbfBytes && allDataTables.length < MAX_DATA_TABLES) {
          const dbfRows = parseDbfAttributeRows(dbfBytes);
          if (dbfRows.length > 0) {
            const layerName = normPath.split('/').pop()?.replace(/\.shp$/i, '') ?? 'layer';
            const cols = Object.keys(dbfRows[0] ?? {});
            allDataTables.push({
              name: layerName,
              package: layerName + '.shp',
              packagePath: normPath,
              columns: cols,
              rows: dbfRows,
              rowCount: dbfRows.length,
              hasGeometry: true,
            });
          }
        }
      } else {
        shpSkipped++;
      }
    }
  }

  const qgsKey = pickQgsExtentKey(keys);
  let extentAdded = false;
  if (merged.length === 0 && qgsKey) {
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
    if (allDataTables.length > 0) {
      return {
        geojson: null,
        bounds: null,
        dataTables: allDataTables.slice(0, MAX_DATA_TABLES),
        layers: buildLayerSummaries([], allDataTables),
        message: `Archive "${archiveLabel}": ${allDataTables.length} SQL attribute table(s) loaded (no WGS84 geometries for map). Tap a layer for all fields.`,
      };
    }
    const hint =
      gpkgKeysOrdered.length > 0
        ? 'Archive contained .gpkg / .sqlite file(s) but no readable vector geometries (empty tables, unknown binary layout, or CRS outside WGS84-like bounds for map extent). Add .geojson layers or open in QField.'
        : shpKeysOrdered.length > 0
          ? 'Archive contained .shp file(s) but no readable line/polygon/point records (or unsupported shape types).'
          : outerHadQgz && qgzNestedOpened === 0
            ? 'Archive contains .qgz project file(s) but they could not be opened as a ZIP (or gzip-wrapped ZIP). Re-save from QGIS as .qgz or include root layers.gpkg.'
            : 'No .gpkg / .shp layers, no GeoJSON sidecars, and no readable .qgs canvas extent found in the archive (after opening nested .qgz if present).';
    return { geojson: null, bounds: null, dataTables: [], message: hint };
  }

  const parts: string[] = [];
  if (qgzNestedOpened > 0) {
    parts.push(
      `${qgzNestedOpened} nested QGIS project archive${qgzNestedOpened > 1 ? 's' : ''} (.qgz unpacked)`
    );
  }
  if (gpkgOk > 0) {
    parts.push(
      `${gpkgOk} spatial DB layer source(s) (${gpkgKeysOrdered.length} .gpkg/.sqlite/.db scanned)`
    );
  }
  if (shpOk > 0) {
    parts.push(
      `${shpOk} shapefile layer${shpOk > 1 ? 's' : ''} (${shpKeysOrdered.length} .shp scanned)`
    );
  }
  if (extentAdded) {
    parts.push('project canvas extent (fallback - map CRS may differ from WGS84)');
  }
  if (gpkgSkipped > 0 && gpkgOk === 0 && !extentAdded && shpOk === 0) {
    parts.push(`${gpkgSkipped} GeoPackage(s) had no readable layers`);
  }
  if (shpSkipped > 0 && shpOk === 0 && gpkgOk === 0 && !extentAdded) {
    parts.push(`${shpSkipped} shapefile(s) had no readable geometries`);
  }

  const objectPhrase = merged.length === 1 ? 'one map object' : `${merged.length} map objects`;
  let msg = `Archive "${archiveLabel}": ${parts.join(' + ')} - ${objectPhrase}.`;
  if (gpkgOk === 0 && shpOk === 0 && extentAdded) {
    msg += ` Archive listing: ${summarizeVectorishFiles(keys)} (paths found in zip).`;
  }
  msg += ' Map fields: package / layer / source.';

  const layerSummaries = buildLayerSummaries(merged, allDataTables.slice(0, MAX_DATA_TABLES));
  if (allDataTables.length > 0) {
    msg += ` ${allDataTables.length} SQL table(s) with attributes.`;
  }

  return {
    geojson: { type: 'FeatureCollection', features: merged },
    bounds: unionBounds,
    layers: layerSummaries,
    dataTables: allDataTables.slice(0, MAX_DATA_TABLES),
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
    message: 'Map preview supports .gpkg, .qgz, .zip (root or nested .gpkg + .shp + nested .qgz + optional .geojson/.json FeatureCollections; .qgs extent is used only when no vectors are found), or plain .qgs.',
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
