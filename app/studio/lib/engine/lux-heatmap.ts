/**
 * Spatial lux heatmap — inverse-distance from lighting fixtures (EN 12464-1 targets).
 */
import type { DesignRoom } from '../model';
import type { ResolvedNode } from '../model';
import type { LoadSpec } from '../catalog';
import { LUX } from './lighting-design-shared';

export type LuxCell = { x: number; y: number; lux: number };

export type RoomLuxHeatmap = {
  roomId: string;
  targetLux: number;
  achievedLux: number;
  minLux: number;
  maxLux: number;
  cells: LuxCell[];
  compliant: boolean;
};

const GRID = 8;
const PX_PER_M = 50;

function roomAreaM2(r: DesignRoom): number {
  return (r.width / PX_PER_M) * (r.height / PX_PER_M);
}

function lumensForFixture(node: ResolvedNode): number {
  if (node.spec.domain !== 'load') return 800;
  const l = node.spec as LoadSpec;
  const p = Number(node.params.powerW) || l.powerW;
  return Math.max(400, p * 80);
}

function fixturesInRoom(room: DesignRoom, nodes: ResolvedNode[]): ResolvedNode[] {
  return nodes.filter((n) => {
    if (n.spec.domain !== 'load') return false;
    const l = n.spec as LoadSpec;
    if (l.category !== 'LIGHTING') return false;
    const cx = n.x + 20;
    const cy = n.y + 20;
    return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
  });
}

/** Compute lux at a point from nearby fixtures (simplified point-source model). */
function luxAt(
  x: number,
  y: number,
  fixtures: { x: number; y: number; lumens: number }[],
  roomAreaM2: number,
): number {
  if (fixtures.length === 0) {
    return 0;
  }
  let total = 0;
  for (const f of fixtures) {
    const dM = Math.max(0.5, Math.hypot(x - f.x, y - f.y) / PX_PER_M);
    total += (f.lumens / (4 * Math.PI * dM * dM)) * 0.65;
  }
  const ambient = (roomAreaM2 > 0 ? 50 / roomAreaM2 : 0);
  return total + ambient;
}

export function computeLuxHeatmaps(rooms: DesignRoom[], nodes: ResolvedNode[]): RoomLuxHeatmap[] {
  return rooms.map((room) => {
    const target = LUX[room.zone];
    const fixtures = fixturesInRoom(room, nodes).map((n) => ({
      x: n.x + 20,
      y: n.y + 20,
      lumens: lumensForFixture(n),
    }));

    const area = roomAreaM2(room);
    const cols = Math.max(2, Math.ceil(room.width / GRID));
    const rows = Math.max(2, Math.ceil(room.height / GRID));
    const cells: LuxCell[] = [];
    let minLux = Infinity;
    let maxLux = 0;
    let sumLux = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = room.x + (col + 0.5) * (room.width / cols);
        const y = room.y + (row + 0.5) * (room.height / rows);
        const lux = luxAt(x, y, fixtures, area);
        cells.push({ x: x - room.x, y: y - room.y, lux });
        minLux = Math.min(minLux, lux);
        maxLux = Math.max(maxLux, lux);
        sumLux += lux;
      }
    }

    const achievedLux = cells.length ? sumLux / cells.length : 0;
    return {
      roomId: room.id,
      targetLux: target,
      achievedLux: Math.round(achievedLux),
      minLux: Math.round(minLux === Infinity ? 0 : minLux),
      maxLux: Math.round(maxLux),
      cells,
      compliant: achievedLux >= target * 0.9,
    };
  });
}

export function luxColor(lux: number, target: number): string {
  const ratio = target > 0 ? lux / target : 0;
  if (ratio >= 0.95) return 'rgba(52, 211, 153, 0.55)';
  if (ratio >= 0.75) return 'rgba(250, 204, 21, 0.5)';
  if (ratio >= 0.5) return 'rgba(251, 146, 60, 0.5)';
  return 'rgba(239, 68, 68, 0.45)';
}
