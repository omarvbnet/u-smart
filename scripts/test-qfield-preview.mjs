import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Load compiled path via tsx
const { pathToFileURL } = await import('url');

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Usage: npx tsx scripts/test-qfield-preview.mts <zip-path>');
    process.exit(1);
  }
  const { extractQfieldMapPreviewFromBytes } = await import('../lib/qfield-map-preview.ts');
  const zip = readFileSync(zipPath);
  const preview = await extractQfieldMapPreviewFromBytes('sample.zip', new Uint8Array(zip));
  const feats = preview.geojson?.features ?? [];
  const byLayer = new Map();
  for (const f of feats) {
    const layer = f.properties?.layer ?? '?';
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
