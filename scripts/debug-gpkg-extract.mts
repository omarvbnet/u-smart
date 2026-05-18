import { readFileSync } from 'fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const wkx = require('wkx') as {
  Geometry: { parse: (b: Buffer) => { toGeoJSON: () => unknown } };
};

const bytes = readFileSync(process.argv[2]!);

const initSqlJs = (await import('sql.js')).default;
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const wasm = readFileSync(wasmPath);
const u8 = new Uint8Array(wasm);
const SQL = await initSqlJs({
  wasmBinary: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
});
const db = new SQL.Database(new Uint8Array(bytes));

function geopackageBlobToWkb(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 9 || buf[0] !== 0x47 || buf[1] !== 0x50) return null;
  const flags = buf[3];
  if (((flags >> 4) & 1) === 1) return null;
  const envBytes = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 }[(flags >> 1) & 7] ?? 0;
  return buf.subarray(8 + envBytes);
}

const stmt = db.prepare('SELECT "geom" AS g FROM "FAT" WHERE "geom" IS NOT NULL LIMIT 2');
let n = 0;
while (stmt.step()) {
  n++;
  const row = stmt.getAsObject() as { g?: unknown };
  const raw = row.g;
  const buf = raw instanceof Uint8Array ? raw : null;
  if (!buf) {
    console.log('not uint8', typeof raw);
    continue;
  }
  const wkb = geopackageBlobToWkb(buf);
  console.log('wkb len', wkb?.length);
  if (wkb) {
    const g = wkx.Geometry.parse(Buffer.from(wkb)).toGeoJSON();
    console.log('geojson', JSON.stringify(g));
  }
}
stmt.free();
console.log('rows', n);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
let tc = 0;
while (tables.step()) tc++;
tables.free();
console.log('table count', tc);

db.close();
