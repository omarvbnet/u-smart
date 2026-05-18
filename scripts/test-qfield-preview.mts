import { readFileSync } from 'fs';
import { extractQfieldMapPreviewFromBytes } from '../lib/qfield-map-preview';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: npx tsx scripts/test-qfield-preview.mts <zip-path>');
  process.exit(1);
}

const arg2 = process.argv[3];
let preview;
if (arg2 === '--gpkg-only') {
  const gpkg = readFileSync(zipPath);
  preview = await extractQfieldMapPreviewFromBytes('Layers.gpkg', new Uint8Array(gpkg));
} else {
  const zip = readFileSync(zipPath);
  preview = await extractQfieldMapPreviewFromBytes('sample.zip', new Uint8Array(zip));
}
const feats = preview.geojson?.features ?? [];
const byLayer = new Map<string, number>();
for (const f of feats) {
  const layer = String(f.properties?.layer ?? '?');
  const gt = f.geometry?.type ?? 'null';
  const k = `${layer}|${gt}`;
  byLayer.set(k, (byLayer.get(k) ?? 0) + 1);
}

console.log('message:', preview.message);
console.log('features:', feats.length);
console.log('bounds:', preview.bounds);
console.log('defaultCrs:', preview.defaultCrsEpsg);
console.log('layers:', preview.layers);
console.log('by layer|type:', [...byLayer.entries()].sort());
console.log(
  'dataTables:',
  preview.dataTables?.map((t) => ({ name: t.name, rows: t.rowCount, hasGeom: t.hasGeometry }))
);

// Sample first coord per layer
const sample = new Map<string, unknown>();
for (const f of feats) {
  const layer = String(f.properties?.layer ?? '?');
  if (sample.has(layer)) continue;
  const g = f.geometry;
  if (g && 'coordinates' in g) sample.set(layer, { type: g.type, coords: JSON.stringify(g.coordinates).slice(0, 120) });
}
console.log('coord samples:', Object.fromEntries(sample));
