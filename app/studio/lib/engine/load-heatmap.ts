/**
 * Electrical load density heatmap per room (W/m² from placed loads).
 */
import type { DesignRoom } from '../model';
import type { ResolvedNode } from '../model';
import type { LoadSpec } from '../catalog';
import { LUX } from './lighting-design-shared';

export type LoadCell = { x: number; y: number; wPerM2: number };

export type RoomLoadHeatmap = {
  roomId: string;
  targetWPerM2: number;
  peakWPerM2: number;
  averageWPerM2: number;
  cells: LoadCell[];
};

const TARGET_W_M2: Record<DesignRoom['zone'], number> = {
  general: 12,
  bedroom: 8,
  kitchen: 25,
  bathroom: 15,
  office: 18,
  corridor: 6,
  mechanical: 10,
};

const GRID = 8;
const PX_PER_M = 50;

function roomAreaM2(r: DesignRoom): number {
  return (r.width / PX_PER_M) * (r.height / PX_PER_M);
}

function loadW(node: ResolvedNode): number {
  if (node.spec.domain === 'load') return Number(node.params.powerW) || (node.spec as LoadSpec).powerW;
  if (node.spec.domain === 'hvac') return (node.spec as import('../catalog').HvacSpec).inputKw * 1000;
  return 0;
}

function loadsInRoom(room: DesignRoom, nodes: ResolvedNode[]): ResolvedNode[] {
  return nodes.filter((n) => {
    const cx = n.x + 20;
    const cy = n.y + 20;
    return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
  });
}

function wAtPoint(x: number, y: number, sources: { x: number; y: number; w: number }[], areaM2: number): number {
  let total = 0;
  for (const s of sources) {
    const dM = Math.max(0.4, Math.hypot(x - s.x, y - s.y) / PX_PER_M);
    total += s.w / (Math.PI * dM * dM * 4);
  }
  return total + (areaM2 > 0 ? 20 / areaM2 : 0);
}

export function computeLoadHeatmaps(rooms: DesignRoom[], nodes: ResolvedNode[]): RoomLoadHeatmap[] {
  return rooms.map((room) => {
    const area = roomAreaM2(room);
    const target = TARGET_W_M2[room.zone];
    const sources = loadsInRoom(room, nodes)
      .filter((n) => n.spec.domain === 'load' || n.spec.domain === 'hvac')
      .map((n) => ({ x: n.x + 20, y: n.y + 20, w: loadW(n) }));

    const cols = Math.max(2, Math.ceil(room.width / GRID));
    const rows = Math.max(2, Math.ceil(room.height / GRID));
    const cells: LoadCell[] = [];
    let peak = 0;
    let sum = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col + 0.5) * (room.width / cols);
        const y = (row + 0.5) * (room.height / rows);
        const wPerM2 = wAtPoint(room.x + x, room.y + y, sources, area);
        cells.push({ x, y, wPerM2 });
        peak = Math.max(peak, wPerM2);
        sum += wPerM2;
      }
    }

    return {
      roomId: room.id,
      targetWPerM2: target,
      peakWPerM2: Math.round(peak * 10) / 10,
      averageWPerM2: Math.round((sum / cells.length) * 10) / 10,
      cells,
    };
  });
}

export function loadHeatColor(wPerM2: number, target: number): string {
  const ratio = target > 0 ? wPerM2 / target : 0;
  if (ratio <= 0.85) return 'rgba(52, 211, 153, 0.45)';
  if (ratio <= 1.0) return 'rgba(250, 204, 21, 0.5)';
  if (ratio <= 1.25) return 'rgba(251, 146, 60, 0.5)';
  return 'rgba(239, 68, 68, 0.5)';
}

// re-export for toolbar labels consistency
export { LUX };
