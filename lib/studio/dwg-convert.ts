/**
 * Server-side DWG → DXF text conversion service.
 * Attempts: (1) LibreDWG CLI, (2) embedded binary LINE extraction for common R2000+ files.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const exec = promisify(execFile);

export type DwgConvertResult = {
  dxfText: string;
  method: 'libredwg' | 'binary' | 'text';
  warnings: string[];
};

export async function convertDwgToDxf(buffer: Buffer): Promise<DwgConvertResult> {
  const warnings: string[] = [];
  const header = buffer.subarray(0, 6).toString('ascii');

  if (header.startsWith('AC10')) {
    const cli = await tryLibreDwg(buffer);
    if (cli) return { dxfText: cli, method: 'libredwg', warnings };
    warnings.push('LibreDWG CLI not available — used embedded binary LINE extractor.');
    const dxf = extractLinesFromDwgBinary(buffer);
    if (!dxf) throw new Error('Could not extract geometry from DWG. Export to DXF in CAD software.');
    return { dxfText: dxf, method: 'binary', warnings };
  }

  const asText = buffer.toString('utf8');
  if (asText.includes('SECTION') && asText.includes('ENTITIES')) {
    return { dxfText: asText, method: 'text', warnings: ['File appears to be DXF with .dwg extension.'] };
  }

  throw new Error('Unsupported or encrypted DWG. Save As DXF in AutoCAD/BricsCAD.');
}

async function tryLibreDwg(buffer: Buffer): Promise<string | null> {
  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `usmart_${id}.dwg`);
  const outPath = join(tmpdir(), `usmart_${id}.dxf`);
  try {
    await writeFile(inPath, buffer);
    await exec('dwg2dxf', [inPath, '-o', outPath], { timeout: 30000 });
    return await readFile(outPath, 'utf8');
  } catch {
    return null;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

/** Scan DWG binary for LINE-like coordinate pairs (heuristic for simple plans). */
function extractLinesFromDwgBinary(buffer: Buffer): string | null {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  for (let i = 0; i < buffer.length - 32; i += 4) {
    try {
      const x1 = dv.getFloat64(i, true);
      const y1 = dv.getFloat64(i + 8, true);
      const x2 = dv.getFloat64(i + 16, true);
      const y2 = dv.getFloat64(i + 24, true);
      if (!finiteCoord(x1, y1) || !finiteCoord(x2, y2)) continue;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 50 || len > 500000) continue;
      if (Math.abs(x1) < 1e-6 && Math.abs(y1) < 1e-6 && Math.abs(x2) < 1e-6 && Math.abs(y2) < 1e-6) continue;
      lines.push({ x1, y1, x2, y2 });
    } catch {
      continue;
    }
  }

  const unique = dedupeLines(lines).slice(0, 8000);
  if (unique.length < 3) return null;

  const body = unique
    .map(
      (l) => `0
LINE
8
WALL
10
${l.x1}
20
${l.y1}
11
${l.x2}
21
${l.y2}
`,
    )
    .join('');

  return `0
SECTION
2
ENTITIES
${body}0
ENDSEC
0
EOF
`;
}

function finiteCoord(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e7 && Math.abs(y) < 1e7;
}

function dedupeLines(lines: { x1: number; y1: number; x2: number; y2: number }[]) {
  const seen = new Set<string>();
  const out: typeof lines = [];
  for (const l of lines) {
    const k = `${l.x1.toFixed(1)},${l.y1.toFixed(1)},${l.x2.toFixed(1)},${l.y2.toFixed(1)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}
