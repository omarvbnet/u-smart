/**
 * 3D twin — space list, filtering, and material summaries per room / garden.
 */
import type { BimModel, DesignGarden, DesignNode, DesignRoom, DesignWall } from '../model';
import { getCatalogEntry } from '../catalog';
import type { StudioLocale } from '../i18n';
import {
  labelForCeilingType,
  labelForDecoration,
  labelForWallType,
  CEILING_DECORATIONS,
  type CeilingMeta,
} from '../wall-finishes';
import { mergeEffectiveWalls, roomWallId, wallSegment } from './wall-layout';

export type Twin3dSpaceKind = 'room' | 'garden';

export type Twin3dSpace = {
  id: string;
  label: string;
  kind: Twin3dSpaceKind;
};

export type SpaceMaterialRow = {
  id: string;
  category: string;
  label: string;
  detail: string;
  color: string;
};

const FLOOR_ZONE_COLOR: Record<DesignRoom['zone'], string> = {
  general: '#e2e8f0',
  bedroom: '#f1f5f9',
  kitchen: '#e7e5e4',
  bathroom: '#e0f2fe',
  office: '#f1f5f9',
  corridor: '#cbd5e1',
  mechanical: '#94a3b8',
};

const FLOOR_ZONE_LABEL: Record<DesignRoom['zone'], string> = {
  general: 'Living floor',
  bedroom: 'Bedroom floor',
  kitchen: 'Kitchen floor',
  bathroom: 'Bathroom floor',
  office: 'Office floor',
  corridor: 'Corridor floor',
  mechanical: 'Mechanical floor',
};

export function listTwin3dSpaces(
  rooms: DesignRoom[],
  gardens: DesignGarden[] | undefined,
  floorId: string,
): Twin3dSpace[] {
  const out: Twin3dSpace[] = [];
  for (const r of rooms) {
    if (r.floorId && r.floorId !== floorId) continue;
    out.push({ id: r.id, label: r.label, kind: 'room' });
  }
  for (const g of gardens ?? []) {
    if (g.floorId && g.floorId !== floorId) continue;
    out.push({ id: `garden:${g.id}`, label: g.label, kind: 'garden' });
  }
  return out;
}

export function parseTwin3dSpaceId(id: string): { kind: Twin3dSpaceKind; entityId: string } {
  if (id.startsWith('garden:')) return { kind: 'garden', entityId: id.slice(7) };
  return { kind: 'room', entityId: id };
}

export function nodeInRoom(node: DesignNode, room: DesignRoom): boolean {
  if (node.params.roomId === room.id) return true;
  const cx = node.x + 21;
  const cy = node.y + 21;
  return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
}

export function wallBelongsToRoom(wall: DesignWall, roomId: string): boolean {
  if (wall.roomId === roomId) return true;
  return wall.id.startsWith(`rw_${roomId}_`);
}

export function wallsForRoom(bim: BimModel | null, rooms: DesignRoom[], room: DesignRoom, floorId: string): DesignWall[] {
  const all = mergeEffectiveWalls(bim, rooms, floorId);
  const roomWalls = all.filter((w) => wallBelongsToRoom(w, room.id));
  if (roomWalls.length >= 4) return roomWalls;
  return (['north', 'south', 'east', 'west'] as const).map((edge) => {
    const id = roomWallId(room.id, edge);
    const fromBim = all.find((w) => w.id === id);
    if (fromBim) return fromBim;
    const seg = wallSegment(room, edge);
    const meta = bim?.wallMeta?.[id];
    return meta ? { ...seg, ...meta } : seg;
  });
}

function ceilingDecorationLabel(id: CeilingMeta['decoration'] | undefined, locale: StudioLocale): string {
  return CEILING_DECORATIONS.find((d) => d.id === id)?.label[locale] ?? id ?? '—';
}

export function collectSpaceMaterials(
  spaceId: string,
  rooms: DesignRoom[],
  bim: BimModel | null,
  locale: StudioLocale,
  floorId: string,
  gardens?: DesignGarden[],
  nodes?: DesignNode[],
): SpaceMaterialRow[] {
  const parsed = parseTwin3dSpaceId(spaceId);
  if (parsed.kind === 'garden') {
    const garden = gardens?.find((g) => g.id === parsed.entityId);
    if (!garden) return [];
    return [
      {
        id: 'garden-ground',
        category: 'Ground',
        label: garden.label,
        detail: 'Landscape / lawn',
        color: '#86efac',
      },
    ];
  }

  const room = rooms.find((r) => r.id === parsed.entityId);
  if (!room) return [];

  const rows: SpaceMaterialRow[] = [
    {
      id: 'floor',
      category: 'Floor',
      label: FLOOR_ZONE_LABEL[room.zone],
      detail: room.zone,
      color: FLOOR_ZONE_COLOR[room.zone],
    },
  ];

  const ceiling = bim?.ceilingMeta?.[room.id];
  rows.push({
    id: 'ceiling',
    category: 'Ceiling',
    label: labelForCeilingType(ceiling?.ceilingType, locale),
    detail: ceilingDecorationLabel(ceiling?.decoration, locale),
    color: ceiling?.color ?? '#ffffff',
  });

  const walls = wallsForRoom(bim, rooms, room, floorId);
  for (const w of walls) {
    const edge = w.edge ?? w.id.split('_').pop() ?? 'wall';
    rows.push({
      id: w.id,
      category: `Wall · ${edge}`,
      label: labelForWallType(w.wallType, locale),
      detail: labelForDecoration(w.decoration, locale),
      color: w.color ?? '#94a3b8',
    });
  }

  if (nodes?.length) {
    for (const n of nodes) {
      if (!nodeInRoom(n, room)) continue;
      const entry = getCatalogEntry(n.catalogId);
      if (!entry) continue;
      rows.push({
        id: `dev_${n.id}`,
        category: entry.category ?? entry.domain,
        label: n.label,
        detail: entry.name[locale] ?? entry.name.en,
        color: entry.color ?? '#64748b',
      });
    }
  }

  return rows;
}

export function sceneCenterForSpace(
  spaceId: string,
  rooms: DesignRoom[],
  gardens: DesignGarden[] | undefined,
): { x: number; z: number; span: number } | null {
  const parsed = parseTwin3dSpaceId(spaceId);
  if (parsed.kind === 'garden') {
    const g = gardens?.find((x) => x.id === parsed.entityId);
    if (!g) return null;
    return {
      x: (g.x + g.width / 2) / 50,
      z: (g.y + g.height / 2) / 50,
      span: Math.max(g.width, g.height) / 50 + 2,
    };
  }
  const r = rooms.find((x) => x.id === parsed.entityId);
  if (!r) return null;
  return {
    x: (r.x + r.width / 2) / 50,
    z: (r.y + r.height / 2) / 50,
    span: Math.max(r.width, r.height) / 50 + 1.5,
  };
}
