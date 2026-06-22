/**
 * Socket & appliance placement on floor plans — IEC 60364 diversity per room zone.
 */
import type { LoadSpec } from '../catalog';
import type { DesignNode, DesignRoom } from '../model';
import { iraqSocketsForRoom } from './iraq-electrical';

export type OutletCatalogId =
  | 'outlet-socket-single'
  | 'outlet-socket-double'
  | 'outlet-washer'
  | 'outlet-dryer'
  | 'outlet-dishwasher'
  | 'outlet-oven'
  | 'outlet-fridge'
  | 'outlet-cooker'
  | 'outlet-water-heater';

export const OUTLET_PALETTE: { id: OutletCatalogId; label: string }[] = [
  { id: 'outlet-socket-single', label: 'Socket' },
  { id: 'outlet-socket-double', label: 'Double socket' },
  { id: 'outlet-washer', label: 'Washer' },
  { id: 'outlet-dryer', label: 'Dryer' },
  { id: 'outlet-dishwasher', label: 'Dishwasher' },
  { id: 'outlet-oven', label: 'Oven' },
  { id: 'outlet-fridge', label: 'Fridge' },
  { id: 'outlet-cooker', label: 'Cooker' },
  { id: 'outlet-water-heater', label: 'Water heater' },
];

/** Minimum socket outlets by zone — Iraq / IEC 60364 residential spacing. */
export function socketsRequiredForRoom(room: DesignRoom): number {
  switch (room.spaceKind) {
    case 'wc':
      return 1;
    case 'garage':
      return 2;
    case 'hall':
    case 'corridor':
      return Math.max(2, iraqSocketsForRoom(room));
    case 'laundry':
    case 'utility':
      return 3;
    case 'dining':
      return Math.max(4, iraqSocketsForRoom(room));
    default:
      break;
  }
  return iraqSocketsForRoom(room);
}

/** Recommended fixed appliances per room zone. */
export function appliancesForRoom(room: DesignRoom): OutletCatalogId[] {
  switch (room.spaceKind) {
    case 'kitchen':
      return ['outlet-fridge', 'outlet-cooker', 'outlet-oven', 'outlet-dishwasher'];
    case 'bathroom':
      return ['outlet-water-heater', 'outlet-washer'];
    case 'laundry':
      return ['outlet-washer', 'outlet-dryer'];
    case 'garage':
      return [];
    case 'wc':
      return [];
    default:
      break;
  }
  switch (room.zone) {
    case 'kitchen':
      return ['outlet-fridge', 'outlet-cooker', 'outlet-oven', 'outlet-dishwasher'];
    case 'bathroom':
      return ['outlet-water-heater', 'outlet-washer'];
    case 'general':
      return areaM2(room) > 20 ? ['outlet-washer', 'outlet-dryer'] : [];
    default:
      return [];
  }
}

function areaM2(room: DesignRoom): number {
  return (room.width / 50) * (room.height / 50);
}

/** Positions along room walls for socket outlets. */
export function socketWallPositions(room: DesignRoom, count: number): { x: number; y: number }[] {
  const margin = 28;
  const out: { x: number; y: number }[] = [];
  const walls: { axis: 'h' | 'v'; fixed: number; span: number; start: number }[] = [
    { axis: 'h', fixed: room.y + room.height - margin, span: room.width - margin * 2, start: room.x + margin },
    { axis: 'h', fixed: room.y + margin, span: room.width - margin * 2, start: room.x + margin },
    { axis: 'v', fixed: room.x + room.width - margin, span: room.height - margin * 2, start: room.y + margin },
    { axis: 'v', fixed: room.x + margin, span: room.height - margin * 2, start: room.y + margin },
  ];

  let wi = 0;
  for (let i = 0; i < count; i++) {
    const wall = walls[wi % walls.length]!;
    const nOnWall = Math.ceil(count / walls.length);
    const idx = Math.floor(i / walls.length);
    const t = (idx + 0.5) / Math.max(1, nOnWall);
    if (wall.axis === 'h') {
      out.push({ x: wall.start + t * wall.span - 21, y: wall.fixed - 21 });
    } else {
      out.push({ x: wall.fixed - 21, y: wall.start + t * wall.span - 21 });
    }
    if ((i + 1) % nOnWall === 0) wi++;
  }
  return out;
}

/** Position for a large appliance within the room. */
export function appliancePosition(room: DesignRoom, kind: OutletCatalogId, index: number): { x: number; y: number } {
  const margin = 36;
  const slots: Record<string, { x: number; y: number }> = {
    'outlet-fridge': { x: room.x + margin, y: room.y + margin },
    'outlet-cooker': { x: room.x + room.width - margin - 42, y: room.y + margin },
    'outlet-oven': { x: room.x + room.width - margin - 42, y: room.y + margin + 48 },
    'outlet-dishwasher': { x: room.x + margin, y: room.y + room.height - margin - 42 },
    'outlet-washer': { x: room.x + room.width - margin - 42, y: room.y + room.height - margin - 42 },
    'outlet-dryer': { x: room.x + room.width - margin - 42, y: room.y + room.height - margin - 90 },
    'outlet-water-heater': { x: room.x + margin, y: room.y + room.height - margin - 42 },
  };
  const base = slots[kind] ?? { x: room.x + room.width / 2 - 21, y: room.y + room.height / 2 - 21 };
  return { x: base.x + (index % 2) * 24, y: base.y + Math.floor(index / 2) * 24 };
}

export function isOutletCatalog(entry: LoadSpec | undefined): boolean {
  return !!entry && (entry.category === 'SOCKET' || entry.category === 'APPLIANCE');
}

export function placeSocketOutlets(rooms: DesignRoom[], idPrefix = 'outlet'): DesignNode[] {
  const nodes: DesignNode[] = [];
  for (const room of rooms) {
    const count = socketsRequiredForRoom(room);
    const positions = socketWallPositions(room, count);
    positions.forEach((pos, i) => {
      nodes.push({
        id: `${idPrefix}_${room.id}_s${i}`,
        catalogId: i % 3 === 0 ? 'outlet-socket-double' : 'outlet-socket-single',
        label: `${room.label} S${i + 1}`,
        x: pos.x,
        y: pos.y,
        floorId: room.floorId,
        params: { roomId: room.id, showOnMap: true },
      });
    });
  }
  return nodes;
}

export function placeAppliances(rooms: DesignRoom[], idPrefix = 'appliance'): DesignNode[] {
  const nodes: DesignNode[] = [];
  for (const room of rooms) {
    const list = appliancesForRoom(room);
    list.forEach((catalogId, i) => {
      const pos = appliancePosition(room, catalogId, i);
      nodes.push({
        id: `${idPrefix}_${room.id}_${catalogId.replace('outlet-', '')}`,
        catalogId,
        label: `${room.label} ${catalogId.replace('outlet-', '')}`,
        x: pos.x,
        y: pos.y,
        floorId: room.floorId,
        params: { roomId: room.id, showOnMap: true },
      });
    });
  }
  return nodes;
}

export function mergeOutletNodes(existing: DesignNode[], placed: DesignNode[]): DesignNode[] {
  const filtered = existing.filter((n) => !n.id.startsWith('outlet_') && !n.id.startsWith('appliance_'));
  return [...filtered, ...placed];
}

export function outletsInRoom(nodes: DesignNode[], room: DesignRoom, isOutlet: (id: string) => boolean): DesignNode[] {
  return nodes.filter((n) => {
    if (!isOutlet(n.catalogId)) return false;
    if (n.params.roomId === room.id) return true;
    const cx = n.x + 21;
    const cy = n.y + 21;
    return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
  });
}

export function defaultPositionInRoom(room: DesignRoom, catalogId: OutletCatalogId): { x: number; y: number } {
  const existing = socketsRequiredForRoom(room);
  const positions = socketWallPositions(room, existing + 1);
  if (catalogId.startsWith('outlet-socket')) {
    return positions[positions.length - 1] ?? { x: room.x + room.width / 2, y: room.y + room.height - 40 };
  }
  return appliancePosition(room, catalogId, 0);
}
