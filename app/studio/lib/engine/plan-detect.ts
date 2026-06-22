/**
 * U Smart Studio — floor-plan room detection (image analysis).
 *
 * Analyses light regions separated by dark wall lines in an imported plan
 * image and returns room bounding boxes aligned to the canvas map layer.
 */
import type { DesignRoom, BimModel } from '../model';
import { yieldIfBusy } from '../idle';
import { extractBimFromRaster } from './bim-extract';
import { classifyDetectedSpaces } from './plan-space-classify';

export type DetectedRoom = Omit<DesignRoom, 'id'>;

type BBox = { x: number; y: number; w: number; h: number; area: number };

/** Detect rooms from a floor-plan image and position them on the map layer. */
export async function detectRoomsFromMap(
  src: string,
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
): Promise<DetectedRoom[]> {
  const { data, w, h, threshold } = await rasterize(src, Math.min(1000, mapWidth));
  const boxes = await findRoomRegions(data, w, h, threshold);
  const ranked = boxes.sort((a, b) => b.area - a.area).slice(0, 28);
  const scaled = ranked.map((b) => ({
    x: mapX + (b.x / w) * mapWidth,
    y: mapY + (b.y / h) * mapHeight,
    width: Math.max(50, (b.w / w) * mapWidth),
    height: Math.max(40, (b.h / h) * mapHeight),
    area: b.area,
  }));

  const classified = classifyDetectedSpaces(scaled, mapX, mapY, mapWidth, mapHeight);

  return scaled.map((r, i) => {
    const c = classified[i]!;
    return {
      label: c.label,
      zone: c.zone,
      spaceKind: c.spaceKind,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    };
  });
}

/** Detect wall lines from raster floor plan for BIM model. */
export async function detectBimFromMap(
  src: string,
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
): Promise<BimModel> {
  const { data, w, h } = await rasterize(src, Math.min(900, mapWidth));
  return extractBimFromRaster(data, w, h, mapX, mapY, mapWidth, mapHeight);
}

function estimateLightThreshold(data: Uint8ClampedArray): number {
  const samples: number[] = [];
  for (let i = 0; i < data.length; i += 16) {
    samples.push((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 180;
  return Math.min(210, Math.max(145, median + 15));
}

async function rasterize(
  src: string,
  maxW: number,
): Promise<{ data: Uint8ClampedArray; w: number; h: number; threshold: number }> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const threshold = estimateLightThreshold(imageData.data);
  return { data: imageData.data, w, h, threshold };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Flood-fill light pixels to find room-like regions (time-sliced to avoid freezing the tab). */
async function findRoomRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
): Promise<BBox[]> {
  const visited = new Uint8Array(width * height);
  const boxes: BBox[] = [];
  const minArea = (width * height) / 280;
  let frameStart = typeof performance !== 'undefined' ? performance.now() : 0;

  const isFree = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
    const i = (y * width + x) * 4;
    const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return lum > threshold;
  };

  const scanStep = width > 800 ? 5 : 4;
  for (let y = 2; y < height - 2; y += scanStep) {
    for (let x = 2; x < width - 2; x += scanStep) {
      frameStart = await yieldIfBusy(frameStart);
      const idx = y * width + x;
      if (visited[idx] || !isFree(x, y)) continue;
      const stack: [number, number][] = [[x, y]];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      visited[idx] = 1;

      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count++;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited[ni]) continue;
          if (!isFree(nx, ny)) continue;
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
        if (stack.length > 0 && stack.length % 4096 === 0) {
          frameStart = await yieldIfBusy(frameStart);
        }
      }

      const bw = maxX - minX;
      const bh = maxY - minY;
      const area = count;
      if (area < minArea || bw < 14 || bh < 14) continue;
      if (bw / bh > 9 || bh / bw > 9) continue;
      boxes.push({ x: minX, y: minY, w: bw, h: bh, area });
    }
  }

  return mergeOverlapping(boxes);
}

function mergeOverlapping(boxes: BBox[]): BBox[] {
  const out: BBox[] = [];
  for (const b of boxes.sort((a, c) => c.area - a.area)) {
    const overlap = out.some((o) => iou(o, b) > 0.42);
    if (!overlap) out.push(b);
  }
  return out;
}

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
