/**
 * VRF system distribution — indoor unit sizing per room, outdoor module grouping.
 */
import { getCatalogEntry, type HvacSpec } from '../catalog';
import type { DesignNode, DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import { primaryCoolingSystem } from '../project';
import { calculateHvacLoads, type RoomHvacLoad } from './hvac-loads';

export type VrfIndoorPick = {
  catalogId: string;
  model: string;
  label: string;
  style: string;
  coolingKw: number;
  heatingKw: number;
  qty: number;
};

export type RoomVrfAssignment = {
  roomId: string;
  label: string;
  zone: DesignRoom['zone'];
  coolingKw: number;
  heatingKw: number;
  btu: number;
  indoorUnits: VrfIndoorPick[];
  totalIndoorKw: number;
  outdoorGroupId: string;
  outdoorCatalogId: string;
  outdoorLabel: string;
  outdoorCapacityKw: number;
  branchAddress: string;
  connectionRatio: number;
  refrigerantRunM: number;
  nodeIds: string[];
};

export type VrfOutdoorGroup = {
  id: string;
  catalogId: string;
  label: string;
  capacityKw: number;
  connectedCoolingKw: number;
  connectionRatio: number;
  roomIds: string[];
  nodeId?: string;
};

export type VrfDistributionReport = {
  active: boolean;
  rooms: RoomVrfAssignment[];
  outdoorUnits: VrfOutdoorGroup[];
  assumptions: string[];
};

const INDOOR_SIZES: { id: string; kw: number; preferZones: DesignRoom['zone'][] }[] = [
  { id: 'hvac-vrf-indoor-2.2', kw: 2.2, preferZones: ['bedroom', 'bathroom', 'corridor'] },
  { id: 'hvac-vrf-indoor-3.5', kw: 3.5, preferZones: ['bedroom', 'general', 'office'] },
  { id: 'hvac-vrf-indoor-5.0', kw: 5.0, preferZones: ['office', 'general', 'kitchen'] },
  { id: 'hvac-vrf-indoor-7.1', kw: 7.1, preferZones: ['kitchen', 'general', 'office'] },
  { id: 'hvac-vrf-indoor-10.0', kw: 10.0, preferZones: ['kitchen', 'general', 'mechanical'] },
];

const OUTDOOR_SIZES = [
  { id: 'hvac-vrf-outdoor-28', kw: 28 },
  { id: 'hvac-vrf-outdoor-40', kw: 40 },
  { id: 'hvac-vrf-outdoor-56', kw: 56 },
];

const DIVERSITY = 0.85;
const MAX_CONNECTION_RATIO = 130;

function isVrfProject(project: ProjectInfo): boolean {
  const cooling = primaryCoolingSystem(project);
  if (cooling === 'vrf' || cooling === 'multi_split') return true;
  if (project.hvacMode === 'auto') return true;
  return project.hvacTypes.some((t) => t === 'vrf' || t === 'multi_split');
}

function pickIndoorUnits(load: RoomHvacLoad, zone: DesignRoom['zone']): VrfIndoorPick[] {
  let remaining = load.coolingKw;
  const picks: VrfIndoorPick[] = [];

  const sorted = [...INDOOR_SIZES].sort((a, b) => {
    const aPref = a.preferZones.includes(zone) ? 0 : 1;
    const bPref = b.preferZones.includes(zone) ? 0 : 1;
    return aPref - bPref || a.kw - b.kw;
  });

  while (remaining > 0.4 && picks.reduce((s, p) => s + p.qty, 0) < 2) {
    const fit =
      sorted.find((u) => u.kw >= remaining * 0.95 && u.kw <= remaining * 1.35) ??
      sorted.find((u) => u.kw >= remaining) ??
      sorted[sorted.length - 1]!;
    const entry = getCatalogEntry(fit.id) as HvacSpec;
    const existing = picks.find((p) => p.catalogId === fit.id);
    if (existing) existing.qty += 1;
    else {
      picks.push({
        catalogId: fit.id,
        model: entry.model,
        label: entry.name.en,
        style: entry.vrfIndoorStyle ?? 'wall',
        coolingKw: entry.coolingKw,
        heatingKw: entry.heatingKw,
        qty: 1,
      });
    }
    remaining -= fit.kw;
  }

  if (!picks.length) {
    const fallback = getCatalogEntry('hvac-vrf-indoor-2.2') as HvacSpec;
    picks.push({
      catalogId: fallback.id,
      model: fallback.model,
      label: fallback.name.en,
      style: 'wall',
      coolingKw: fallback.coolingKw,
      heatingKw: fallback.heatingKw,
      qty: 1,
    });
  }
  return picks;
}

function groupOutdoorUnits(
  roomLoads: { roomId: string; coolingKw: number }[],
): Map<string, { outdoorId: string; roomIds: string[]; totalKw: number }> {
  const groups = new Map<string, { outdoorId: string; roomIds: string[]; totalKw: number }>();
  let groupIdx = 0;
  let current: { outdoorId: string; roomIds: string[]; totalKw: number } | null = null;

  for (const load of roomLoads) {
    if (!current) {
      current = { outdoorId: `vrf_odu_${groupIdx}`, roomIds: [], totalKw: 0 };
    }
    const projected = current.totalKw + load.coolingKw;
    const outdoorKw = OUTDOOR_SIZES.find((o) => o.kw * DIVERSITY >= projected)?.kw ?? OUTDOOR_SIZES[OUTDOOR_SIZES.length - 1]!.kw;
    if (current.roomIds.length > 0 && projected > outdoorKw * DIVERSITY) {
      groups.set(current.outdoorId, current);
      groupIdx++;
      current = { outdoorId: `vrf_odu_${groupIdx}`, roomIds: [load.roomId], totalKw: load.coolingKw };
    } else {
      current.roomIds.push(load.roomId);
      current.totalKw = projected;
    }
  }
  if (current && current.roomIds.length) groups.set(current.outdoorId, current);
  return groups;
}

function outdoorCatalogForLoad(totalKw: number): string {
  const required = totalKw / DIVERSITY;
  return OUTDOOR_SIZES.find((o) => o.kw >= required)?.id ?? OUTDOOR_SIZES[OUTDOOR_SIZES.length - 1]!.id;
}

function refrigerantRunEstimate(room: DesignRoom, mechanical: DesignRoom | undefined): number {
  if (!mechanical) return Math.max(8, Math.round((room.width + room.height) / 50));
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;
  const mx = mechanical.x + mechanical.width / 2;
  const my = mechanical.y + mechanical.height / 2;
  return Math.max(6, Math.round(Math.hypot(cx - mx, cy - my) / 50));
}

export function calculateVrfDistribution(
  rooms: DesignRoom[],
  project: ProjectInfo,
  nodes: DesignNode[] = [],
): VrfDistributionReport {
  const loads = calculateHvacLoads(rooms, project.buildingType);
  const vrfActive =
    isVrfProject(project) &&
    (loads.recommendedSystems.includes('vrf') ||
      project.hvacTypes.includes('vrf') ||
      project.hvacTypes.includes('multi_split'));

  if (!vrfActive) {
    return { active: false, rooms: [], outdoorUnits: [], assumptions: [] };
  }

  const assumptions = [
    'VRF indoor units sized to room cooling load (max 135% oversizing per unit).',
    'Outdoor connection ratio ≤ 130% with 0.85 diversity factor.',
    'Branch addresses: ODU-group.indoor-index (Mitsubishi City Multi convention).',
  ];

  const targetRooms = loads.rooms.filter((r) => r.coolingKw >= 1.0);
  const groups = groupOutdoorUnits(targetRooms.map((r) => ({ roomId: r.roomId, coolingKw: r.coolingKw })));
  const mechanical = rooms.find((r) => r.zone === 'mechanical');

  const outdoorUnits: VrfOutdoorGroup[] = [];
  const roomAssignments: RoomVrfAssignment[] = [];

  groups.forEach((group, outdoorId) => {
    const catalogId = outdoorCatalogForLoad(group.totalKw);
    const entry = getCatalogEntry(catalogId) as HvacSpec;
    const outdoorNode = nodes.find((n) => n.params.vrfGroupId === outdoorId || n.id === outdoorId);
    outdoorUnits.push({
      id: outdoorId,
      catalogId,
      label: entry.name.en,
      capacityKw: entry.coolingKw,
      connectedCoolingKw: Math.round(group.totalKw * 100) / 100,
      connectionRatio: Math.round((group.totalKw / entry.coolingKw) * 100),
      roomIds: group.roomIds,
      nodeId: outdoorNode?.id,
    });
  });

  let branchCounter = 0;
  groups.forEach((group, outdoorId) => {
    const outdoor = outdoorUnits.find((o) => o.id === outdoorId)!;
    group.roomIds.forEach((roomId, idxInGroup) => {
      const load = targetRooms.find((r) => r.roomId === roomId)!;
      const room = rooms.find((r) => r.id === roomId)!;
      const indoorUnits = pickIndoorUnits(load, room.zone);
      const totalIndoorKw = indoorUnits.reduce((s, u) => s + u.coolingKw * u.qty, 0);
      const nodeIds = nodes
        .filter((n) => n.params.roomId === roomId && (getCatalogEntry(n.catalogId) as HvacSpec | undefined)?.hvacType === 'VRF_INDOOR')
        .map((n) => n.id);
      branchCounter++;
      roomAssignments.push({
        roomId,
        label: room.label,
        zone: room.zone,
        coolingKw: load.coolingKw,
        heatingKw: load.heatingKw,
        btu: load.btu,
        indoorUnits,
        totalIndoorKw: Math.round(totalIndoorKw * 100) / 100,
        outdoorGroupId: outdoorId,
        outdoorCatalogId: outdoor.catalogId,
        outdoorLabel: outdoor.label,
        outdoorCapacityKw: outdoor.capacityKw,
        branchAddress: `${outdoorId.replace('vrf_odu_', 'ODU')}.${idxInGroup + 1}`,
        connectionRatio: Math.round((totalIndoorKw / load.coolingKw) * 100),
        refrigerantRunM: refrigerantRunEstimate(room, mechanical),
        nodeIds,
      });
    });
  });

  return { active: true, rooms: roomAssignments, outdoorUnits, assumptions };
}

export function vrfAssignmentForRoom(report: VrfDistributionReport, roomId: string): RoomVrfAssignment | undefined {
  return report.rooms.find((r) => r.roomId === roomId);
}

export function hvacNodesInRoom(nodes: DesignNode[], room: DesignRoom): DesignNode[] {
  return nodes.filter((n) => {
    const e = getCatalogEntry(n.catalogId);
    if (e?.domain !== 'hvac') return false;
    if (n.params.roomId === room.id) return true;
    const cx = n.x + 21;
    const cy = n.y + 21;
    return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
  });
}

export function indoorPositionInRoom(room: DesignRoom, style: string, index: number): { x: number; y: number } {
  const margin = 32;
  if (style === 'cassette') {
    return { x: room.x + room.width / 2 - 21, y: room.y + margin - 21 };
  }
  if (style === 'duct') {
    return { x: room.x + margin - 21, y: room.y + margin - 21 + index * 28 };
  }
  return { x: room.x + room.width - margin - 42, y: room.y + margin - 21 + index * 32 };
}

export function placeVrfDistribution(
  rooms: DesignRoom[],
  project: ProjectInfo,
  idPrefix = 'hvac_vrf',
): DesignNode[] {
  const report = calculateVrfDistribution(rooms, project);
  if (!report.active) return [];

  const nodes: DesignNode[] = [];
  const mechanical = rooms.find((r) => r.zone === 'mechanical');

  for (const outdoor of report.outdoorUnits) {
    const anchor = mechanical ?? rooms.find((r) => outdoor.roomIds.includes(r.id)) ?? rooms[0];
    if (!anchor) continue;
    nodes.push({
      id: `${idPrefix}_${outdoor.id}`,
      catalogId: outdoor.catalogId,
      label: `VRF ODU ${outdoor.label}`,
      x: anchor.x + anchor.width - 96,
      y: anchor.y + 8,
      floorId: anchor.floorId,
      params: { vrfGroupId: outdoor.id, vrfRole: 'outdoor' },
    });
  }

  for (const row of report.rooms) {
    const room = rooms.find((r) => r.id === row.roomId);
    if (!room) continue;
    let unitIdx = 0;
    for (const unit of row.indoorUnits) {
      for (let q = 0; q < unit.qty; q++) {
        if (project.hvacUnitMode === 'fixed' && nodes.filter((n) => n.params.vrfRole === 'indoor').length >= project.hvacUnitCount) {
          break;
        }
        const pos = indoorPositionInRoom(room, unit.style, unitIdx);
        nodes.push({
          id: `${idPrefix}_${row.roomId}_${unitIdx}`,
          catalogId: unit.catalogId,
          label: `${room.label} VRF ${unit.style}`,
          x: pos.x,
          y: pos.y,
          floorId: room.floorId,
          params: {
            roomId: row.roomId,
            vrfGroupId: row.outdoorGroupId,
            vrfRole: 'indoor',
            branchAddress: row.branchAddress,
            showOnMap: true,
          },
        });
        unitIdx++;
      }
    }
  }

  return nodes;
}

export const VRF_INDOOR_OPTIONS = INDOOR_SIZES.map((s) => s.id);
