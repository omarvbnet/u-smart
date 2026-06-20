/**
 * Structured BIM extraction — walls, doors, windows from CAD or raster plans.
 */
import type { BimModel, DesignOpening, DesignWall, DesignGarden } from '../model';

export type DxfEntity = {
  type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE';
  layer: string;
  points: { x: number; y: number }[];
};

const WALL_LAYERS = /wall|parti|mauer|mur|a-wall|i-wall|arch/i;
const DOOR_LAYERS = /door|dr\b|opening/i;
const WINDOW_LAYERS = /window|glaz|fen/i;
const GARDEN_LAYERS = /garden|landscape|plant|green|lawn|ext|site/i;

function layerKind(layer: string): 'wall' | 'door' | 'window' | 'garden' | 'other' {
  if (DOOR_LAYERS.test(layer)) return 'door';
  if (WINDOW_LAYERS.test(layer)) return 'window';
  if (GARDEN_LAYERS.test(layer)) return 'garden';
  if (WALL_LAYERS.test(layer)) return 'wall';
  return 'other';
}

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function openingFromSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  kind: 'door' | 'window',
  layer: string,
  idx: number,
): DesignOpening {
  const len = segmentLength(a, b);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rotation = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return {
    id: `open_${kind}_${idx}`,
    kind,
    x: cx,
    y: cy,
    width: Math.max(40, len),
    height: kind === 'door' ? 20 : 12,
    rotation,
    layer,
  };
}

export function extractBimFromDxfEntities(entities: DxfEntity[], offsetX = 0, offsetY = 0, flipY = 0): BimModel {
  const walls: DesignWall[] = [];
  const openings: DesignOpening[] = [];
  const gardens: DesignGarden[] = [];
  let wi = 0;
  let oi = 0;
  let gi = 0;

  for (const ent of entities) {
    const kind = layerKind(ent.layer);
    const pts = ent.points;
    if (pts.length < 2) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (segmentLength(a, b) < 8) continue;

      const x1 = a.x + offsetX;
      const y1 = flipY ? flipY - (a.y + offsetY) : a.y + offsetY;
      const x2 = b.x + offsetX;
      const y2 = flipY ? flipY - (b.y + offsetY) : b.y + offsetY;

      if (kind === 'door') {
        openings.push(openingFromSegment({ x: x1, y: y1 }, { x: x2, y: y2 }, 'door', ent.layer, oi++));
      } else if (kind === 'window') {
        openings.push(openingFromSegment({ x: x1, y: y1 }, { x: x2, y: y2 }, 'window', ent.layer, oi++));
      } else if (kind === 'garden' && ent.type === 'LWPOLYLINE' && pts.length >= 3) {
        const xs = pts.map((p) => p.x + offsetX);
        const ys = pts.map((p) => (flipY ? flipY - (p.y + offsetY) : p.y + offsetY));
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        if (maxX - minX > 40 && maxY - minY > 40) {
          gardens.push({
            id: `garden_${gi++}`,
            label: 'Garden',
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          });
        }
      } else if (kind === 'wall' || kind === 'other') {
        walls.push({
          id: `wall_${wi++}`,
          x1,
          y1,
          x2,
          y2,
          thickness: kind === 'wall' ? 2 : 1,
          layer: ent.layer,
        });
      }
    }
  }

  return { walls, openings, gardens: gardens.length ? gardens : undefined };
}

/** Detect wall lines from dark pixels in a rasterized plan (orthogonal segments). */
export function extractBimFromRaster(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
): BimModel {
  const walls: DesignWall[] = [];
  const threshold = 120;
  let wi = 0;

  const isDark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    return lum < threshold;
  };

  const step = Math.max(2, Math.floor(w / 200));
  for (let y = step; y < h - step; y += step) {
    let runStart: number | null = null;
    for (let x = 0; x < w; x++) {
      if (isDark(x, y)) {
        if (runStart == null) runStart = x;
      } else if (runStart != null && x - runStart > w * 0.08) {
        walls.push({
          id: `wall_r_${wi++}`,
          x1: mapX + (runStart / w) * mapW,
          y1: mapY + (y / h) * mapH,
          x2: mapX + (x / w) * mapW,
          y2: mapY + (y / h) * mapH,
          thickness: 1.5,
          layer: 'detected',
        });
        runStart = null;
      } else {
        runStart = null;
      }
    }
  }

  for (let x = step; x < w - step; x += step) {
    let runStart: number | null = null;
    for (let y = 0; y < h; y++) {
      if (isDark(x, y)) {
        if (runStart == null) runStart = y;
      } else if (runStart != null && y - runStart > h * 0.08) {
        walls.push({
          id: `wall_r_${wi++}`,
          x1: mapX + (x / w) * mapW,
          y1: mapY + (runStart / h) * mapH,
          x2: mapX + (x / w) * mapW,
          y2: mapY + (y / h) * mapH,
          thickness: 1.5,
          layer: 'detected',
        });
        runStart = null;
      } else {
        runStart = null;
      }
    }
  }

  return { walls, openings: [] };
}

export function mergeBimModels(...models: BimModel[]): BimModel {
  const walls: DesignWall[] = [];
  const openings: DesignOpening[] = [];
  const gardens: DesignGarden[] = [];
  for (const m of models) {
    walls.push(...m.walls);
    openings.push(...m.openings);
    if (m.gardens) gardens.push(...m.gardens);
  }
  return { walls, openings, gardens: gardens.length ? gardens : undefined };
}
