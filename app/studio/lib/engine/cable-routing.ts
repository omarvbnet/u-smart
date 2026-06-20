/**
 * Corridor-aware orthogonal cable routing on the floor plan.
 */
import type { DesignRoom } from '../model';
import { angleBetween, CABLE_PX_PER_M } from '../node-layout';

export type CableSegment = {
  x: number;
  y: number;
  lengthM: number;
  rotation: number;
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function segment(a: { x: number; y: number }, b: { x: number; y: number }): CableSegment {
  const lengthPx = dist(a, b);
  const lengthM = Math.max(3, Math.round(lengthPx / 50));
  return {
    x: a.x,
    y: a.y,
    lengthM,
    rotation: angleBetween(a.x, a.y, b.x, b.y),
  };
}

/** Route along room perimeter corridor when both endpoints are inside the same room. */
function routeViaCorridor(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  room: DesignRoom,
): { x: number; y: number }[] {
  const m = 14;
  const top = room.y + m;
  const bottom = room.y + room.height - m;
  const left = room.x + m;
  const right = room.x + room.width - m;

  const startNearTop = ay - room.y < room.height / 2;
  const corridorY = startNearTop ? top : bottom;
  const endNearLeft = bx - room.x < room.width / 2;
  const corridorX = endNearLeft ? left : right;

  return [
    { x: ax, y: ay },
    { x: ax, y: corridorY },
    { x: corridorX, y: corridorY },
    { x: corridorX, y: by },
    { x: bx, y: by },
  ];
}

function simplifyPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const out = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) < 4) continue;
    out.push(cur);
  }
  return out;
}

function manhattanPath(ax: number, ay: number, bx: number, by: number): { x: number; y: number }[] {
  const hFirst = dist({ x: ax, y: ay }, { x: bx, y: ay }) + dist({ x: bx, y: ay }, { x: bx, y: by });
  const vFirst = dist({ x: ax, y: ay }, { x: ax, y: by }) + dist({ x: ax, y: by }, { x: bx, y: by });
  if (hFirst <= vFirst) return simplifyPath([{ x: ax, y: ay }, { x: bx, y: ay }, { x: bx, y: by }]);
  return simplifyPath([{ x: ax, y: ay }, { x: ax, y: by }, { x: bx, y: by }]);
}

function insideRoom(x: number, y: number, room: DesignRoom): boolean {
  return x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height;
}

/** Orthogonal cable path — prefers room corridor when endpoints share a room. */
export function routeCableSegments(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rooms: DesignRoom[] = [],
): CableSegment[] {
  const room =
    rooms.find((r) => insideRoom(ax, ay, r) && insideRoom(bx, by, r)) ??
    rooms.find((r) => r.zone === 'corridor' && insideRoom((ax + bx) / 2, (ay + by) / 2, r));

  const path = room ? simplifyPath(routeViaCorridor(ax, ay, bx, by, room)) : manhattanPath(ax, ay, bx, by);

  const segments: CableSegment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    segments.push(segment(path[i]!, path[i + 1]!));
  }
  return segments.length ? segments : [segment({ x: ax, y: ay }, { x: bx, y: by })];
}

export function totalRouteLengthM(segments: CableSegment[]): number {
  return segments.reduce((s, seg) => s + seg.lengthM, 0);
}

/** Legacy single-segment helper — uses first leg of routed path. */
export function cableRunRouted(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rooms: DesignRoom[] = [],
): CableSegment {
  const segs = routeCableSegments(ax, ay, bx, by, rooms);
  if (segs.length === 1) return segs[0]!;
  const totalM = totalRouteLengthM(segs);
  return { ...segs[0]!, lengthM: totalM };
}
