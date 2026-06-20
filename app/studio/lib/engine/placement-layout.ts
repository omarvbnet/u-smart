/**
 * Auto-placement of lighting fixtures and HVAC units from engineering calculations.
 */
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { ProjectInfo, HvacSystemType } from '../project';
import { primaryCoolingSystem, effectiveHvacTypes } from '../project';
import { calculateLightingDesign, type LightingDesignReport } from './lighting-design';
import { calculateHvacLoads, type HvacLoadReport } from './hvac-loads';
import { placeVrfDistribution } from './vrf-distribution';
import { routeCableSegments } from './cable-routing';
import { getCatalogEntry, type HvacSpec, type CableSpec } from '../catalog';
import { formatCableLabel, conduitTypeForCable } from './cable-map';
import { placeHvacUnitsByLightCount } from './room-controls-layout';

const HVAC_CATALOG: Record<HvacSystemType, string> = {
  split: 'hvac-split-3.5',
  multi_split: 'hvac-vrf-40',
  vrf: 'hvac-vrf-40',
  chiller: 'hvac-chiller-300',
  fcu: 'hvac-fcu-5',
  ahu: 'hvac-ahu-50',
  package: 'hvac-package-30',
  heat_pump: 'hvac-heatpump-12',
};

export function placeLightingFixtures(
  rooms: DesignRoom[],
  idPrefix = 'light',
  report?: LightingDesignReport,
): DesignNode[] {
  const lighting = report ?? calculateLightingDesign(rooms);
  const nodes: DesignNode[] = [];

  for (const row of lighting.rooms) {
    const room = rooms.find((r) => r.id === row.roomId);
    if (!room) continue;
    const count = row.fixturesRecommended;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const padX = room.width * 0.15;
    const padY = room.height * 0.15;
    const cellW = (room.width - padX * 2) / Math.max(1, cols);
    const cellH = (room.height - padY * 2) / Math.max(1, rows);

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);
      nodes.push({
        id: `${idPrefix}_${room.id}_${i}`,
        catalogId: row.catalogId,
        label: `${room.label} ${row.fixtureType} ${i + 1}`,
        x: room.x + padX + col * cellW + cellW / 2 - 21,
        y: room.y + padY + rowIdx * cellH + cellH / 2 - 21,
        floorId: room.floorId,
        params: {
          powerW: Math.round(row.powerW / count),
          lightingType: row.fixtureType,
        },
      });
    }
  }

  return nodes;
}

export function placeHvacUnits(
  rooms: DesignRoom[],
  project: ProjectInfo,
  hvacReport?: HvacLoadReport,
): DesignNode[] {
  const loads = hvacReport ?? calculateHvacLoads(rooms, project.buildingType);
  const types = project.hvacMode === 'auto' ? loads.recommendedSystems : effectiveHvacTypes(project);
  const cooling = primaryCoolingSystem(project);
  const useVrf =
    types.includes('vrf') ||
    types.includes('multi_split') ||
    cooling === 'vrf' ||
    cooling === 'multi_split' ||
    (project.hvacMode === 'auto' && loads.recommendedSystems.includes('vrf'));

  if (useVrf) {
    return placeVrfDistribution(rooms, project);
  }

  if (!project.smartBuilding) {
    return placeHvacUnitsByLightCount(rooms, project);
  }

  const catalogId = HVAC_CATALOG[cooling] ?? HVAC_CATALOG[types[0] ?? 'split'] ?? 'hvac-split-3.5';
  const nodes: DesignNode[] = [];
  const mechanical = rooms.find((r) => r.zone === 'mechanical');
  let targetRooms = loads.rooms.filter((r) => r.coolingKw >= 1.0).map((r) => r.roomId);
  if (!targetRooms.length) targetRooms = rooms.filter((r) => r.zone !== 'corridor').map((r) => r.id);

  if (project.hvacUnitMode === 'fixed') {
    const count = Math.max(1, project.hvacUnitCount);
    const picked: string[] = [];
    for (let i = 0; i < count; i++) picked.push(targetRooms[i % Math.max(1, targetRooms.length)]!);
    targetRooms = picked;
  }

  targetRooms.forEach((roomId, i) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const anchor = mechanical ?? room;
    nodes.push({
      id: `hvac_auto_${roomId}_${i}`,
      catalogId,
      label: `${project.coolingSystem.toUpperCase()} · ${room.label}`,
      x: room.x + room.width - 88,
      y: room.y + 16 + (i % 2) * 36,
      params: { roomId, showOnMap: true, hvacRole: 'cooling' },
      floorId: room.floorId,
    });
    if (project.heatingSystem !== project.coolingSystem) {
      const heatCatalog = HVAC_CATALOG[project.heatingSystem] ?? catalogId;
      nodes.push({
        id: `hvac_heat_${roomId}_${i}`,
        catalogId: heatCatalog,
        label: `Heat · ${room.label}`,
        x: room.x + room.width - 88,
        y: room.y + 52 + (i % 2) * 36,
        params: { roomId, showOnMap: true, hvacRole: 'heating' },
      });
    }
  });

  if (!nodes.length && rooms.length) {
    const r = rooms[0]!;
    nodes.push({
      id: 'hvac_auto_0',
      catalogId,
      label: 'HVAC',
      x: r.x + r.width - 88,
      y: r.y + 16,
      params: { roomId: r.id, showOnMap: true },
    });
  }

  return nodes;
}

export function mergePlacementNodes(existing: DesignNode[], placed: DesignNode[], domain: 'light' | 'hvac'): DesignNode[] {
  const prefix = domain === 'light' ? 'light_' : 'hvac_auto_';
  const vrfPrefix = 'hvac_vrf_';
  const lightCatalog = /^(load-lighting|load-downlight|load-linear|load-spot|load-magnetic)$/;
  const filtered = existing.filter((n) => {
    if (n.id.startsWith(prefix) || n.id.startsWith(vrfPrefix)) return false;
    if (domain === 'light' && lightCatalog.test(n.catalogId) && n.id.startsWith('load_')) return false;
    if (domain === 'hvac') {
      const e = getCatalogEntry(n.catalogId) as HvacSpec | undefined;
      if (e?.hvacType === 'VRF_INDOOR' || e?.hvacType === 'VRF_OUTDOOR') return false;
    }
    return true;
  });
  return [...filtered, ...placed];
}

export function wireRoomLoads(
  panelId: string,
  room: DesignRoom,
  loadNodes: DesignNode[],
  rooms: DesignRoom[],
  edgeFn: (s: string, sh: string, t: string, th: string) => DesignEdge,
  nodePush: (n: DesignNode) => void,
  edgePush: (e: DesignEdge) => void,
): void {
  const mcbId = `mcb_${room.id}`;
  const mcbX = room.x + 8;
  const mcbY = room.y + 8;

  nodePush({ id: mcbId, catalogId: 'mcb-c10', label: `${room.label} MCB`, x: mcbX, y: mcbY, params: {} });
  edgePush(edgeFn(panelId, 'out', mcbId, 'line'));

  loadNodes.forEach((load, idx) => {
    const cableId = `cable_${room.id}_${idx}`;
    const segs = routeCableSegments(mcbX, mcbY, load.x + 21, load.y + 21, rooms);
    const seg = segs[0]!;
    const cableEntry = getCatalogEntry('cable-lv-cu-2.5') as CableSpec;
    const conduitType = conduitTypeForCable(cableEntry);
    const label = formatCableLabel(room.label, cableEntry, idx, conduitType);
    nodePush({
      id: cableId,
      catalogId: 'cable-lv-cu-2.5',
      label,
      x: seg.x,
      y: seg.y,
      params: {
        lengthM: segs.reduce((s, x) => s + x.lengthM, 0),
        rotation: seg.rotation,
        roomId: room.id,
        roomLabel: room.label,
        circuitIndex: idx,
        conduitType,
        showOnMap: true,
      },
    });
    edgePush(edgeFn(mcbId, 'load', cableId, 'a'));
    edgePush(edgeFn(cableId, 'b', load.id, 'in'));
  });
}
