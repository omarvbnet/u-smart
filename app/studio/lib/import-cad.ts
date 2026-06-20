'use client';

/**
 * DXF/DWG geometry import — LINE, LWPOLYLINE, layer-aware BIM extraction.
 */
import type { BimModel } from './model';
import { extractBimFromDxfEntities, type DxfEntity } from './engine/bim-extract';

export type CadImportResult = {
  src: string;
  width: number;
  height: number;
  wallCount: number;
  bim: BimModel;
  sourceFormat: 'dxf' | 'dwg';
};

export async function importDxfText(
  dxfText: string,
  sourceFormat: 'dxf' | 'dwg' = 'dxf',
): Promise<CadImportResult> {
  const entities = parseDxfEntities(dxfText);
  if (entities.length === 0) throw new Error('No geometry found in CAD file');

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ent of entities) {
    for (const p of ent.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  const pad = 40;
  const w = Math.max(400, Math.ceil(maxX - minX + pad * 2));
  const h = Math.max(400, Math.ceil(maxY - minY + pad * 2));
  const ox = -minX + pad;
  const oy = -minY + pad;
  const flipY = h;

  const bim = extractBimFromDxfEntities(entities, ox, oy, flipY);

  const lines: string[] = [];
  for (const ent of entities) {
    const pts = ent.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const stroke = ent.layer.match(/wall|parti/i) ? '#475569' : '#64748b';
      lines.push(
        `<line x1="${a.x + ox}" y1="${flipY - (a.y + oy)}" x2="${b.x + ox}" y2="${flipY - (b.y + oy)}" stroke="${stroke}" stroke-width="1.2"/>`,
      );
    }
  }

  for (const o of bim.openings) {
    const color = o.kind === 'door' ? '#b45309' : '#0ea5e9';
    lines.push(
      `<rect x="${o.x - o.width / 2}" y="${o.y - o.height / 2}" width="${o.width}" height="${o.height}" fill="${color}" opacity="0.35" transform="rotate(${o.rotation ?? 0} ${o.x} ${o.y})"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <g>${lines.join('')}</g>
</svg>`;

  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: w,
    height: h,
    wallCount: bim.walls.length,
    bim,
    sourceFormat,
  };
}

export async function importDxfFile(file: File): Promise<CadImportResult> {
  return importDxfText(await file.text(), 'dxf');
}

export async function importDwgViaApi(file: File): Promise<CadImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/studio/convert-dwg', { method: 'POST', body: form });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? 'DWG conversion failed');
  }
  const { dxfText } = (await res.json()) as { dxfText: string };
  return importDxfText(dxfText, 'dwg');
}

function parseDxfEntities(dxf: string): DxfEntity[] {
  const lines = dxf.split(/\r?\n/);
  const entities: DxfEntity[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim();
    if (code === '0') {
      if (val === 'LINE') {
        const ent = readLineEntity(lines, i + 2);
        if (ent) entities.push(ent);
      } else if (val === 'LWPOLYLINE' || val === 'POLYLINE') {
        const ent = readPolylineEntity(lines, i + 2, val as 'LWPOLYLINE' | 'POLYLINE');
        if (ent) entities.push(ent);
      }
    }
    i += 2;
  }
  return entities.filter((e) => e.points.length >= 2);
}

function readLineEntity(lines: string[], start: number): DxfEntity | null {
  let layer = '0';
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  let got1 = false;
  let got2 = false;
  for (let i = start; i < lines.length - 1; i += 2) {
    const c = lines[i]?.trim();
    const v = lines[i + 1]?.trim();
    if (c === '0') break;
    if (c === '8') layer = v ?? '0';
    else if (c === '10') {
      x1 = Number(v);
      got1 = true;
    } else if (c === '20') y1 = Number(v);
    else if (c === '11') {
      x2 = Number(v);
      got2 = true;
    } else if (c === '21') y2 = Number(v);
  }
  if (!got1 || !got2 || Math.hypot(x2 - x1, y2 - y1) < 8) return null;
  return { type: 'LINE', layer, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] };
}

function readPolylineEntity(lines: string[], start: number, type: 'LWPOLYLINE' | 'POLYLINE'): DxfEntity | null {
  let layer = '0';
  const verts: { x: number; y: number }[] = [];
  let cx = 0;
  let cy = 0;
  let mode: 'x' | 'y' | null = null;
  for (let i = start; i < lines.length - 1; i += 2) {
    const c = lines[i]?.trim();
    const v = lines[i + 1]?.trim();
    if (c === '0') break;
    if (c === '8') layer = v ?? '0';
    else if (c === '10') {
      cx = Number(v);
      mode = 'x';
    } else if (c === '20' && mode === 'x') {
      cy = Number(v);
      verts.push({ x: cx, y: cy });
      mode = null;
    }
  }
  if (verts.length < 2) return null;
  return { type, layer, points: verts };
}

export function isDxfFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith('.dxf') || file.type === 'image/vnd.dxf';
}

export function isDwgFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dwg');
}
