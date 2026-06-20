/**
 * Door / window placement on room layouts + HDL actuator pairing.
 */
import { getCatalogEntry } from '../catalog';
import type { DesignNode, DesignOpening, DesignRoom, BimModel } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { defaultControlState } from '../controls';

export type CurtainStyle = 'none' | 'roll' | 'single' | 'double';

const NO_WINDOW: DesignRoom['zone'][] = ['bathroom', 'mechanical', 'corridor'];
const NO_DOOR: DesignRoom['zone'][] = ['corridor'];

function curtainForZone(zone: DesignRoom['zone'], smart: boolean): CurtainStyle {
  if (!smart) return 'none';
  if (zone === 'kitchen') return 'roll';
  if (zone === 'bedroom') return 'double';
  return 'single';
}

export function openingsForRooms(
  rooms: DesignRoom[],
  options: { smart?: boolean; floorId?: string } = {},
): DesignOpening[] {
  const openings: DesignOpening[] = [];
  for (const room of rooms) {
    if (NO_DOOR.includes(room.zone)) continue;
    openings.push({
      id: `door_${room.id}`,
      kind: 'door',
      x: room.x + room.width / 2,
      y: room.y + room.height,
      width: 76,
      height: 18,
      rotation: 0,
      roomId: room.id,
      floorId: room.floorId ?? options.floorId,
      smartEnabled: options.smart ?? false,
      openPercent: 0,
      curtainStyle: 'none',
    });
    if (NO_WINDOW.includes(room.zone)) continue;
    openings.push({
      id: `win_${room.id}`,
      kind: 'window',
      x: room.x + room.width / 2,
      y: room.y + 4,
      width: Math.min(110, Math.max(64, room.width * 0.35)),
      height: 16,
      rotation: 0,
      roomId: room.id,
      floorId: room.floorId ?? options.floorId,
      smartEnabled: options.smart ?? false,
      openPercent: 0,
      curtainStyle: curtainForZone(room.zone, options.smart ?? false),
    });
  }
  return openings;
}

export function actuatorsForOpenings(
  openings: DesignOpening[],
  locale: StudioLocale,
  floorId?: string,
): { openings: DesignOpening[]; nodes: DesignNode[] } {
  const next: DesignOpening[] = [];
  const nodes: DesignNode[] = [];
  for (const o of openings) {
    let linkedNodeId = o.linkedNodeId;
    if (o.smartEnabled && o.kind === 'window' && o.curtainStyle !== 'none') {
      linkedNodeId = linkedNodeId ?? `act_curtain_${o.id}`;
      const entry = getCatalogEntry('hdl-curtain');
      nodes.push({
        id: linkedNodeId,
        catalogId: 'hdl-curtain',
        label: entry?.name[locale] ?? 'Curtain',
        x: o.x - 28,
        y: o.y - 20,
        floorId: o.floorId ?? floorId,
        params: { openingId: o.id, showOnMap: true },
      });
    }
    if (o.smartEnabled && o.kind === 'door') {
      linkedNodeId = linkedNodeId ?? `act_door_${o.id}`;
      const entry = getCatalogEntry('hdl-drycontact');
      nodes.push({
        id: linkedNodeId,
        catalogId: 'hdl-drycontact',
        label: entry?.name[locale] ?? 'Door contact',
        x: o.x + 24,
        y: o.y + 8,
        floorId: o.floorId ?? floorId,
        params: { openingId: o.id, showOnMap: true },
      });
    }
    next.push({ ...o, linkedNodeId });
  }
  return { openings: next, nodes };
}

export function mergeOpeningActuators(existing: DesignNode[], actuators: DesignNode[]): DesignNode[] {
  const actuatorIds = new Set(actuators.map((n) => n.id));
  const openingIds = new Set(actuators.map((n) => String(n.params.openingId ?? '')).filter(Boolean));
  const kept = existing.filter((n) => !actuatorIds.has(n.id) && (!n.params.openingId || !openingIds.has(String(n.params.openingId))));
  return [...kept, ...actuators];
}

export function buildBimOpenings(
  rooms: DesignRoom[],
  project: ProjectInfo,
  locale: StudioLocale,
  floorId?: string,
): { bim: BimModel; actuatorNodes: DesignNode[]; controls: Record<string, ReturnType<typeof defaultControlState>> } {
  const raw = openingsForRooms(rooms, { smart: project.smartBuilding, floorId });
  const { openings, nodes } = actuatorsForOpenings(raw, locale, floorId);
  const controls: Record<string, ReturnType<typeof defaultControlState>> = {};
  for (const n of nodes) {
    const entry = getCatalogEntry(n.catalogId);
    if (entry) controls[n.id] = defaultControlState(entry);
  }
  return { bim: { walls: [], openings, gardens: [] }, actuatorNodes: nodes, controls };
}

export function syncOpeningsFromControls(
  bim: BimModel | null,
  controls: Record<string, { on?: boolean; level?: number }>,
): BimModel | null {
  if (!bim?.openings.length) return bim;
  const openings = bim.openings.map((o) => {
    if (!o.linkedNodeId) return o;
    const c = controls[o.linkedNodeId];
    if (!c) return o;
    if (o.kind === 'window') return { ...o, openPercent: c.level ?? o.openPercent ?? 0 };
    if (o.kind === 'door') return { ...o, openPercent: c.on ? 100 : 0 };
    return o;
  });
  return { ...bim, openings };
}

export function openingOpenPercent(
  opening: DesignOpening,
  controls: Record<string, { on?: boolean; level?: number }>,
): number {
  if (opening.linkedNodeId) {
    const c = controls[opening.linkedNodeId];
    if (opening.kind === 'window') return c?.level ?? opening.openPercent ?? 0;
    if (opening.kind === 'door') return c?.on ? 100 : opening.openPercent ?? 0;
  }
  return opening.openPercent ?? 0;
}
