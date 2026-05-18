import { readFileSync } from 'fs';
import { gunzipSync, unzipSync } from 'fflate';

const zipPath = process.argv[2]!;
const data = readFileSync(zipPath);

function tryUnzip(data: Uint8Array): Record<string, Uint8Array> | null {
  if (data[0] === 0x50 && data[1] === 0x4b) {
    return unzipSync(data, { filter: () => true }) as Record<string, Uint8Array>;
  }
  if (data[0] === 0x1f && data[1] === 0x8b) {
    const dec = gunzipSync(data);
    if (dec[0] === 0x50 && dec[1] === 0x4b) {
      return unzipSync(dec, { filter: () => true }) as Record<string, Uint8Array>;
    }
  }
  return null;
}

let files = tryUnzip(new Uint8Array(data))!;
console.log('outer keys:', Object.keys(files).sort());

let qgzOpened = 0;
for (const [path, bytes] of Object.entries({ ...files })) {
  if (!path.toLowerCase().endsWith('.qgz')) continue;
  const inner = tryUnzip(bytes);
  if (!inner) {
    console.log('qgz failed to open:', path);
    continue;
  }
  qgzOpened++;
  console.log('\nqgz inner keys for', path, ':', Object.keys(inner).sort());
  for (const k of Object.keys(inner)) {
    if (/\.(gpkg|shp|qgs)$/i.test(k)) console.log('  vector:', k, inner[k]?.length);
  }
  const prefix = path.replace(/\\/g, '/').replace(/\.qgz$/i, '');
  for (const [ik, ib] of Object.entries(inner)) {
    files[`${prefix}/${ik.replace(/^\//, '')}`] = ib;
  }
}

const gpkg = Object.keys(files).filter((k) => k.toLowerCase().endsWith('.gpkg'));
console.log('\nall gpkg paths after qgz expand:', gpkg);
