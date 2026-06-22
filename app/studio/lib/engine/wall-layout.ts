/**
 * Wall geometry from rooms, outdoor envelope, and opening snap-to-wall placement.
 */
import type { DesignOpening, DesignRoom, DesignWall, BimModel } from '../model';
import { defaultWallColor } from '../wall-finishes';

export type WallEdge = 'north' | 'south' | 'east' | 'west';

export type WallMeta = {
  thickness?: number;
  heightM?: number;
  wallType?: DesignWall['wallType'];
  decoration?: DesignWall['decoration'];
  color?: string;
};

export function roomWallId(roomId: string, edge: WallEdge): string {
  return `rw_${roomId}_${edge}`;
}

export function wallSegment(room: DesignRoom, edge: WallEdge): DesignWall {
  const { x, y, width, height } = room;
  const base = {
    roomId: room.id,
    floorId: room.floorId,
    edge,
    thickness: 6,
    heightM: 2.8,
    layer: 'room',
    wallType: 'drywall' as const,
    decoration: 'paint' as const,
    color: defaultWallColor('drywall', false),
  };
  switch (edge) {
    case 'north':
      return { id: roomWallId(room.id, 'north'), x1: x, y1: y, x2: x + width, y2: y, ...base };
    case 'south':
      return { id: roomWallId(room.id, 'south'), x1: x, y1: y + height, x2: x + width, y2: y + height, ...base };
    case 'west':
      return { id: roomWallId(room.id, 'west'), x1: x, y1: y, x2: x, y2: y + height, ...base };
    case 'east':
      return { id: roomWallId(room.id, 'east'), x1: x + width, y1: y, x2: x + width, y2: y + height, ...base };
  }
}

export function wallsFromRooms(rooms: DesignRoom[], floorId?: string): DesignWall[] {
  const list: DesignWall[] = [];
  for (const room of rooms) {
    if (floorId && room.floorId && room.floorId !== floorId) continue;
    list.push(wallSegment(room, 'north'), wallSegment(room, 'south'), wallSegment(room, 'west'), wallSegment(room, 'east'));
  }
  return markOutdoorWalls(list, rooms, floorId);
}

function markOutdoorWalls(walls: DesignWall[], rooms: DesignRoom[], floorId?: string): DesignWall[] {
  const floorRooms = rooms.filter((r) => !floorId || !r.floorId || r.floorId === floorId);
  if (!floorRooms.length) return walls;
  const minX = Math.min(...floorRooms.map((r) => r.x));
  const minY = Math.min(...floorRooms.map((r) => r.y));
  const maxX = Math.max(...floorRooms.map((r) => r.x + r.width));
  const maxY = Math.max(...floorRooms.map((r) => r.y + r.height));
  const eps = 3;
  return walls.map((w) => {
    let outdoor = false;
    if (w.edge === 'north' && Math.abs(w.y1 - minY) < eps) outdoor = true;
    if (w.edge === 'south' && Math.abs(w.y1 - maxY) < eps) outdoor = true;
    if (w.edge === 'west' && Math.abs(w.x1 - minX) < eps) outdoor = true;
    if (w.edge === 'east' && Math.abs(w.x1 - maxX) < eps) outdoor = true;
    return outdoor
      ? {
          ...w,
          outdoor: true,
          wallType: w.wallType ?? 'concrete',
          color: w.color ?? defaultWallColor('concrete', true),
        }
      : { ...w, outdoor };
  });
}

export function applyWallMeta(walls: DesignWall[], meta?: Record<string, WallMeta>): DesignWall[] {
  if (!meta) return walls;
  return walls.map((w) => {
    const m = meta[w.id];
    if (!m) return w;
    return {
      ...w,
      thickness: m.thickness ?? w.thickness,
      heightM: m.heightM ?? w.heightM,
      wallType: m.wallType ?? w.wallType,
      decoration: m.decoration ?? w.decoration,
      color: m.color ?? w.color,
    };
  });
}

/** CAD walls when present; otherwise room perimeter walls. */
export function mergeEffectiveWalls(bim: BimModel | null, rooms: DesignRoom[], floorId?: string): DesignWall[] {
  const cad = (bim?.walls ?? []).filter((w) => !floorId || !w.floorId || w.floorId === floorId);
  if (cad.length > 0) {
    return applyWallMeta(
      cad.map((w) => ({ ...w, outdoor: w.outdoor ?? true })),
      bim?.wallMeta,
    );
  }
  return applyWallMeta(wallsFromRooms(rooms, floorId), bim?.wallMeta);
}

export function wallLength(w: DesignWall): number {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

export function wallLengthM(w: DesignWall): number {
  return wallLength(w) / 50;
}

export function wallAngleDeg(w: DesignWall): number {
  return (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
}

/** Unit normal pointing from wall center toward the room exterior (plan pixels). */
export function outwardWallNormal(w: DesignWall, rooms: DesignRoom[]): { nx: number; ny: number } {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (w.roomId) {
    const room = rooms.find((r) => r.id === w.roomId);
    if (room) {
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      const mx = (w.x1 + w.x2) / 2;
      const my = (w.y1 + w.y2) / 2;
      const interior = (mx + nx - cx) ** 2 + (my + ny - cy) ** 2;
      const exterior = (mx - nx - cx) ** 2 + (my - ny - cy) ** 2;
      if (interior < exterior) {
        nx = -nx;
        ny = -ny;
      }
    }
  }
  return { nx, ny };
}

export function outwardWallOffset(w: DesignWall, rooms: DesignRoom[], distancePx: number): { dx: number; dy: number } {
  const { nx, ny } = outwardWallNormal(w, rooms);
  return { dx: nx * distancePx, dy: ny * distancePx };
}

export function openingPlanPositionFor3d(
  opening: DesignOpening,
  wall: DesignWall | undefined,
  rooms: DesignRoom[],
): { x: number; y: number } {
  if (!wall) return { x: opening.x, y: opening.y };
  const pad = Math.max(10, (wall.thickness ?? 6) * 3 + 6);
  const off = outwardWallOffset(wall, rooms, pad);
  return { x: opening.x + off.dx, y: opening.y + off.dy };
}

export function pointOnWall(w: DesignWall, t: number): { x: number; y: number } {
  const clamped = Math.max(0.04, Math.min(0.96, t));
  return {
    x: w.x1 + (w.x2 - w.x1) * clamped,
    y: w.y1 + (w.y2 - w.y1) * clamped,
  };
}

export function projectToWall(
  w: DesignWall,
  px: number,
  py: number,
): { t: number; x: number; y: number; dist: number } {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return { t: 0.5, x: w.x1, y: w.y1, dist: Math.hypot(px - w.x1, py - w.y1) };
  let t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
  t = Math.max(0.05, Math.min(0.95, t));
  const x = w.x1 + t * dx;
  const y = w.y1 + t * dy;
  return { t, x, y, dist: Math.hypot(px - x, py - y) };
}

export function nearestWall(
  walls: DesignWall[],
  px: number,
  py: number,
  maxDist = 56,
): { wall: DesignWall; t: number; x: number; y: number } | null {
  let best: { wall: DesignWall; t: number; x: number; y: number; dist: number } | null = null;
  for (const w of walls) {
    const p = projectToWall(w, px, py);
    if (p.dist <= maxDist && (!best || p.dist < best.dist)) {
      best = { wall: w, t: p.t, x: p.x, y: p.y, dist: p.dist };
    }
  }
  return best ? { wall: best.wall, t: best.t, x: best.x, y: best.y } : null;
}

export function orientOpeningOnWall(opening: DesignOpening, wall: DesignWall, t: number): DesignOpening {
  const { x, y } = pointOnWall(wall, t);
  return {
    ...opening,
    wallId: wall.id,
    along: t,
    x,
    y,
    rotation: wallAngleDeg(wall),
    roomId: wall.roomId ?? opening.roomId,
    floorId: wall.floorId ?? opening.floorId,
  };
}

export function snapOpening(opening: DesignOpening, walls: DesignWall[], px: number, py: number): DesignOpening {
  const hit = nearestWall(walls, px, py);
  if (!hit) return { ...opening, x: px, y: py, wallId: undefined, along: undefined };
  return orientOpeningOnWall(opening, hit.wall, hit.t);
}

/** Link imported openings to the nearest wall segments. */
export function snapOpeningsToWalls(openings: DesignOpening[], walls: DesignWall[]): DesignOpening[] {
  return openings.map((o) => {
    if (o.wallId) {
      const wall = walls.find((w) => w.id === o.wallId);
      if (wall) return orientOpeningOnWall(o, wall, o.along ?? 0.5);
    }
    const hit = nearestWall(walls, o.x, o.y, 80);
    if (hit) return orientOpeningOnWall(o, hit.wall, hit.t);
    return o;
  });
}

export function isCadWall(wallId: string, bim: BimModel | null): boolean {
  return !!bim?.walls.some((w) => w.id === wallId);
}

export function translateWall(w: DesignWall, dx: number, dy: number): DesignWall {
  return { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy };
}

export function resnapOpeningsForRoom(
  openings: DesignOpening[],
  roomId: string,
  walls: DesignWall[],
): DesignOpening[] {
  return openings.map((o) => {
    if (o.wallId) {
      const wall = walls.find((w) => w.id === o.wallId);
      if (wall) return orientOpeningOnWall(o, wall, o.along ?? 0.5);
    }
    if (o.roomId === roomId) {
      const hit = nearestWall(walls, o.x, o.y, 80);
      if (hit) return orientOpeningOnWall(o, hit.wall, hit.t);
    }
    return o;
  });
}

export function setWallLength(w: DesignWall, lenPx: number): DesignWall {
  const current = wallLength(w);
  if (current < 1) return w;
  const scale = lenPx / current;
  return { ...w, x2: w.x1 + (w.x2 - w.x1) * scale, y2: w.y1 + (w.y2 - w.y1) * scale };
}

export function roomPatchForWallLength(w: DesignWall, lenPx: number, room: DesignRoom): Partial<DesignRoom> | null {
  if (!w.edge) return null;
  const current = wallLength(w);
  const delta = lenPx - current;
  switch (w.edge) {
    case 'north':
    case 'south':
      return { width: Math.max(60, room.width + delta) };
    case 'east':
    case 'west':
      return { height: Math.max(50, room.height + delta) };
    default:
      return null;
  }
}

export function wallLabel(w: DesignWall, rooms: DesignRoom[]): string {
  if (w.roomId) {
    const room = rooms.find((r) => r.id === w.roomId);
    const edge = w.edge ?? '?';
    return room ? `${room.label} · ${edge}` : w.id;
  }
  return w.layer ?? w.id;
}

export function isVirtualRoomWall(wallId: string): boolean {
  return wallId.startsWith('rw_');
}
