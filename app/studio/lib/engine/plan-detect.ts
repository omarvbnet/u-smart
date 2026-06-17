/**
 * U Smart Studio — floor-plan room detection (image analysis).
 *
 * Analyses light regions separated by dark wall lines in an imported plan
 * image and returns room bounding boxes aligned to the canvas map layer.
 */
import type { DesignRoom } from '../model';

export type DetectedRoom = Omit<DesignRoom, 'id'>;

const ROOM_LABELS = ['Living', 'Kitchen', 'Bedroom', 'Bathroom', 'Office', 'Corridor', 'Storage', 'MEP'];
const ZONE_BY_LABEL: Record<string, DesignRoom['zone']> = {
  Living: 'general',
  Kitchen: 'kitchen',
  Bedroom: 'bedroom',
  Bathroom: 'bathroom',
  Office: 'office',
  Corridor: 'corridor',
  Storage: 'general',
  MEP: 'mechanical',
};

type BBox = { x: number; y: number; w: number; h: number; area: number };

/** Detect rooms from a floor-plan image and position them on the map layer. */
export async function detectRoomsFromMap(
  src: string,
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
): Promise<DetectedRoom[]> {
  const { data, w, h } = await rasterize(src, Math.min(900, mapWidth));
  const boxes = findRoomRegions(data, w, h);
  const scaled = boxes
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .map((b) => ({
      x: mapX + (b.x / w) * mapWidth,
      y: mapY + (b.y / h) * mapHeight,
      width: Math.max(60, (b.w / w) * mapWidth),
      height: Math.max(50, (b.h / h) * mapHeight),
    }));

  return scaled.map((r, i) => ({
    label: ROOM_LABELS[i] ?? `Room ${i + 1}`,
    zone: ZONE_BY_LABEL[ROOM_LABELS[i] ?? ''] ?? 'general',
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  }));
}

async function rasterize(src: string, maxW: number): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
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
  return { data: imageData.data, w, h };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Flood-fill light pixels to find room-like regions. */
function findRoomRegions(data: Uint8ClampedArray, width: number, height: number): BBox[] {
  const visited = new Uint8Array(width * height);
  const boxes: BBox[] = [];
  const minArea = (width * height) / 200;

  const isFree = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
    const i = (y * width + x) * 4;
    const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    return lum > 175;
  };

  for (let y = 2; y < height - 2; y += 4) {
    for (let x = 2; x < width - 2; x += 4) {
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
      }

      const w = maxX - minX;
      const h = maxY - minY;
      const area = count;
      if (area < minArea || w < 20 || h < 20) continue;
      if (w / h > 8 || h / w > 8) continue;
      boxes.push({ x: minX, y: minY, w, h, area });
    }
  }

  return mergeOverlapping(boxes);
}

function mergeOverlapping(boxes: BBox[]): BBox[] {
  const out: BBox[] = [];
  for (const b of boxes.sort((a, c) => c.area - a.area)) {
    const overlap = out.some((o) => iou(o, b) > 0.45);
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
