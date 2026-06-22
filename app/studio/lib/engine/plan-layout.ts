/**
 * Infer wall / ceiling finishes from detected room zones after plan import.
 */
import type { BimModel, DesignRoom, RoomSpaceKind } from '../model';
import type { CeilingDecoration, CeilingType, WallDecoration, WallType } from '../wall-finishes';
import { mergeEffectiveWalls } from './wall-layout';

type WallMetaEntry = {
  wallType?: WallType;
  decoration?: WallDecoration;
  color?: string;
};

type CeilingMetaEntry = {
  ceilingType?: CeilingType;
  decoration?: CeilingDecoration;
  color?: string;
};

const SPACE_WALL: Partial<Record<RoomSpaceKind, WallMetaEntry>> = {
  garage: { wallType: 'concrete', decoration: 'none', color: '#64748b' },
  wc: { wallType: 'drywall', decoration: 'tile', color: '#e0f2fe' },
  bathroom: { wallType: 'drywall', decoration: 'tile', color: '#e0f2fe' },
  hall: { wallType: 'partition', decoration: 'paint', color: '#e2e8f0' },
  corridor: { wallType: 'partition', decoration: 'paint', color: '#cbd5e1' },
  dining: { wallType: 'drywall', decoration: 'paint', color: '#fafaf9' },
  living: { wallType: 'drywall', decoration: 'paint', color: '#f8fafc' },
  laundry: { wallType: 'drywall', decoration: 'tile', color: '#f1f5f9' },
  utility: { wallType: 'concrete', decoration: 'none', color: '#94a3b8' },
  kitchen: { wallType: 'drywall', decoration: 'tile', color: '#f1f5f9' },
};

const ZONE_WALL: Record<DesignRoom['zone'], WallMetaEntry> = {
  general: { wallType: 'drywall', decoration: 'paint', color: '#f8fafc' },
  bedroom: { wallType: 'drywall', decoration: 'paint', color: '#e2e8f0' },
  kitchen: { wallType: 'drywall', decoration: 'tile', color: '#f1f5f9' },
  bathroom: { wallType: 'drywall', decoration: 'tile', color: '#e0f2fe' },
  office: { wallType: 'drywall', decoration: 'paint', color: '#f1f5f9' },
  corridor: { wallType: 'partition', decoration: 'paint', color: '#cbd5e1' },
  mechanical: { wallType: 'concrete', decoration: 'none', color: '#94a3b8' },
};

const ZONE_CEILING: Record<DesignRoom['zone'], CeilingMetaEntry> = {
  general: { ceilingType: 'flat', decoration: 'paint', color: '#ffffff' },
  bedroom: { ceilingType: 'flat', decoration: 'paint', color: '#ffffff' },
  kitchen: { ceilingType: 'suspended', decoration: 'acoustic_tile', color: '#f8fafc' },
  bathroom: { ceilingType: 'suspended', decoration: 'acoustic_tile', color: '#f1f5f9' },
  office: { ceilingType: 'acoustic', decoration: 'acoustic_tile', color: '#f8fafc' },
  corridor: { ceilingType: 'flat', decoration: 'paint', color: '#e2e8f0' },
  mechanical: { ceilingType: 'exposed', decoration: 'none', color: '#64748b' },
};

function roomAtPoint(rooms: DesignRoom[], x: number, y: number): DesignRoom | undefined {
  return rooms.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
}

/** Assign wall types / colors from adjacent room zones; exterior walls use concrete. */
export function inferFinishMetaFromPlan(
  rooms: DesignRoom[],
  bim: BimModel | null,
  floorId?: string,
): { wallMeta: Record<string, WallMetaEntry>; ceilingMeta: Record<string, CeilingMetaEntry> } {
  const wallMeta: Record<string, WallMetaEntry> = { ...(bim?.wallMeta ?? {}) };
  const ceilingMeta: Record<string, CeilingMetaEntry> = { ...(bim?.ceilingMeta ?? {}) };

  for (const room of rooms) {
    if (floorId && room.floorId && room.floorId !== floorId) continue;
    const preset = ZONE_CEILING[room.zone] ?? ZONE_CEILING.general;
    ceilingMeta[room.id] = { ...preset, ...ceilingMeta[room.id] };
  }

  const walls = mergeEffectiveWalls(bim, rooms, floorId);
  for (const wall of walls) {
    if (wallMeta[wall.id]) continue;
    const mx = (wall.x1 + wall.x2) / 2;
    const my = (wall.y1 + wall.y2) / 2;
    const room = wall.roomId ? rooms.find((r) => r.id === wall.roomId) : roomAtPoint(rooms, mx, my);
    if (wall.outdoor || !room) {
      wallMeta[wall.id] = { wallType: 'concrete', decoration: 'none', color: '#94a3b8' };
      continue;
    }
    const zonePreset = ZONE_WALL[room.zone] ?? ZONE_WALL.general;
    const spacePreset = room.spaceKind ? SPACE_WALL[room.spaceKind] : undefined;
    wallMeta[wall.id] = {
      ...zonePreset,
      ...spacePreset,
      wallType: room.spaceKind === 'hall' || room.spaceKind === 'corridor' ? 'glass' : (spacePreset?.wallType ?? zonePreset.wallType),
    };
  }

  return { wallMeta, ceilingMeta };
}
