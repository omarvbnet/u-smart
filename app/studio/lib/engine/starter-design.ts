/**
 * Generate an initial engineering layout from wizard selections + optional rooms.
 */
import type { DesignNode, DesignEdge, DesignRoom, BimModel } from '../model';
import type { ProjectInfo, HvacSystemType } from '../project';
import type { StudioLocale } from '../i18n';
import { cableRunRouted } from './cable-routing';
import { labelCablesOnly, formatCableLabel, conduitTypeForCable } from './cable-map';
import { getCatalogEntry, type CableSpec } from '../catalog';
import { placeLightingFixtures, placeHvacUnits, mergePlacementNodes } from './placement-layout';
import { placeSocketOutlets, placeAppliances, mergeOutletNodes } from './outlet-placement';
import { seedRoomsForProject } from './floor-layout';
import { placeSmartChannelSystem } from './smart-channel-layout';
import { placeRoomControls } from './room-controls-layout';
import { buildBimOpenings, mergeOpeningActuators } from './opening-layout';
import { calculateLightingDesign, type LightingDesignReport } from './lighting-design';
import type { ControlState } from '../controls';
import { defaultControlState } from '../controls';

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

const SOURCE_CATALOG: Record<string, string> = {
  grid: 'src-utility-400',
  generator: 'src-generator-100',
  solar: 'src-solar-30',
  battery: 'src-battery-48',
  ups: 'src-ups-20',
};

export function buildStarterDesign(
  project: ProjectInfo,
  locale: StudioLocale,
  rooms: DesignRoom[],
): { nodes: DesignNode[]; edges: DesignEdge[]; name: string } {
  const bt = project.buildingType;
  const names: Record<StudioLocale, string> = {
    ar: `تصميم ${buildingNameAr(bt)}`,
    en: `${buildingNameEn(bt)} Design`,
    ku: `دیزاینی ${buildingNameEn(bt)}`,
    tr: `${buildingNameEn(bt)} Tasarımı`,
  };

  const nodes: DesignNode[] = [];
  const edges: DesignEdge[] = [];
  const targets = rooms.length > 0 ? rooms : seedRoomsForProject(project);
  const groundId = targets.find((r) => r.floorId)?.floorId ?? 'floor_0';
  const minRoomX = targets.length ? Math.min(...targets.map((r) => r.x)) : 0;
  const yBase = targets.length ? Math.min(...targets.map((r) => r.y)) + 40 : 200;
  let xSource = minRoomX - 200;

  // Primary energy sources from wizard
  project.energySources.forEach((src, i) => {
    const catalogId = SOURCE_CATALOG[src];
    if (!catalogId) return;
    const id = `src_${src}`;
    const params: DesignNode['params'] = { floorId: groundId };
    if (src === 'solar') {
      params.ratedKva = project.solarCapacityKw;
      params.capacityKw = project.solarCapacityKw;
    }
    nodes.push({ id, catalogId, label: src === 'solar' ? `Solar ${project.solarCapacityKw} kW` : src, x: xSource, y: yBase + i * 120, floorId: groundId, params });
  });

  const mainId = 'panel_main';
  nodes.push({ id: mainId, catalogId: 'load-distribution-board', label: 'Main DB', x: minRoomX - 80, y: yBase + 40, floorId: groundId, params: {} });

  const primarySrc = nodes[0];
  if (primarySrc) {
    edges.push(edge(primarySrc.id, 'out', mainId, 'in'));
  }

  // Room-based lighting & socket loads placed on floor plan
  targets.forEach((room) => {
    const cx = room.x + room.width / 2;
    const cy = room.y + room.height / 2;
    const mcbId = `mcb_${room.id}`;
    const cableId = `cable_${room.id}`;
    const lightId = `load_${room.id}`;

    const mcbX = room.x + 8;
    const mcbY = room.y + 8;
    const loadX = cx - 20;
    const loadY = cy;
    const run = cableRunRouted(mcbX, mcbY, loadX, loadY, targets);

    const cableEntry = getCatalogEntry('cable-lv-cu-2.5') as CableSpec;
    const conduitType = conduitTypeForCable(cableEntry);
    const cableLabel = formatCableLabel(room.label, cableEntry, 0, conduitType);

    nodes.push({ id: mcbId, catalogId: 'mcb-c10', label: `${room.label} MCB`, x: mcbX, y: mcbY, floorId: room.floorId ?? groundId, params: {} });
    nodes.push({
      id: cableId,
      catalogId: 'cable-lv-cu-2.5',
      label: cableLabel,
      x: run.x,
      y: run.y,
      floorId: room.floorId ?? groundId,
      params: {
        lengthM: run.lengthM,
        rotation: run.rotation,
        roomId: room.id,
        roomLabel: room.label,
        circuitIndex: 0,
        conduitType,
        showOnMap: true,
      },
    });
    nodes.push({ id: lightId, catalogId: 'load-lighting', label: room.label, x: loadX, y: loadY, floorId: room.floorId ?? groundId, params: { powerW: roomAreaW(room) } });

    edges.push(edge(mainId, 'out', mcbId, 'line'));
    edges.push(edge(mcbId, 'load', cableId, 'a'));
    edges.push(edge(cableId, 'b', lightId, 'in'));
  });

  // HVAC from wizard
  const hvacTypes = project.hvacMode === 'auto' ? pickAutoHvac(project.buildingType) : project.hvacTypes;
  hvacTypes.slice(0, 2).forEach((ht, i) => {
    const catalogId = HVAC_CATALOG[ht];
    if (!catalogId) return;
    const mcbId = `mcb_hvac_${i}`;
    const cableId = `cable_hvac_${i}`;
    const hvacId = `hvac_${i}`;
    const room = targets[i] ?? targets[0];
    const baseY = room ? room.y + room.height + 48 + i * 100 : yBase + 200 + i * 120;
    const hvacX = room ? room.x + room.width - 72 : 900;
    const hvacY = room ? room.y + 40 : 400 + i * 120;
    const mcbX = room ? room.x + 8 : minRoomX;
    const mcbY = baseY;
    const hvacRun = cableRunRouted(mcbX, mcbY, hvacX, hvacY, targets);

    const hvacCableEntry = getCatalogEntry('cable-lv-cu-4') as CableSpec;
    const hvacConduit = conduitTypeForCable(hvacCableEntry);
    const hvacLabel = formatCableLabel(room?.label ?? 'HVAC', hvacCableEntry, i, hvacConduit);

    nodes.push({ id: mcbId, catalogId: 'mcb-c16', label: 'HVAC MCB', x: mcbX, y: mcbY, params: {} });
    nodes.push({
      id: cableId,
      catalogId: 'cable-lv-cu-4',
      label: hvacLabel,
      x: hvacRun.x,
      y: hvacRun.y,
      params: {
        lengthM: hvacRun.lengthM,
        rotation: hvacRun.rotation,
        roomId: room?.id,
        roomLabel: room?.label ?? 'HVAC',
        circuitIndex: i,
        conduitType: hvacConduit,
        showOnMap: true,
      },
    });
    nodes.push({
      id: hvacId,
      catalogId,
      label: ht,
      x: hvacX,
      y: hvacY,
      params: {},
    });
    edges.push(edge(mainId, 'out', mcbId, 'line'));
    edges.push(edge(mcbId, 'load', cableId, 'a'));
    edges.push(edge(cableId, 'b', hvacId, 'in'));
  });

  // Smart home bus devices when enabled
  if (project.smartBuilding && project.smartProtocol) {
    const protos = project.smartProtocol === 'BOTH' ? ['HDL', 'KNX'] : [project.smartProtocol];
    protos.forEach((proto, i) => {
      const gwId = `gw_${proto}`;
      const catalogId = proto === 'KNX' ? 'knx-gateway' : 'hdl-gateway';
      const psuId = proto === 'KNX' ? 'knx-buspsu' : 'hdl-buspsu';
      const room = targets[0];
      const baseX = room ? room.x + 20 : 100;
      const baseY = room ? room.y + room.height - 60 : 520 + i * 80;
      nodes.push({
        id: gwId,
        catalogId,
        label: `${proto} Gateway`,
        x: baseX,
        y: baseY,
        params: {},
      });
      nodes.push({
        id: `psu_${proto}`,
        catalogId: psuId,
        label: `${proto} Bus PSU 640mA`,
        x: baseX + 48,
        y: baseY + 36,
        params: {},
      });
    });
  }

  const routedNodes = nodes;

  return { nodes: routedNodes, edges, name: names[locale] };
}

function buildControlsForNodes(
  nodes: DesignNode[],
  extra: Record<string, ControlState>,
): Record<string, ControlState> {
  const controls: Record<string, ControlState> = { ...extra };
  for (const n of nodes) {
    if (controls[n.id]) continue;
    const entry = getCatalogEntry(n.catalogId);
    if (!entry) continue;
    if (
      entry.domain === 'load' ||
      entry.domain === 'smarthome' ||
      entry.domain === 'hvac' ||
      entry.category === 'APPLIANCE' ||
      entry.category === 'SOCKET'
    ) {
      controls[n.id] = defaultControlState(entry);
    }
  }
  return controls;
}

/** Full engineering layout from wizard project settings (used after setup). */
export function generateProjectDesign(
  project: ProjectInfo,
  rooms: DesignRoom[],
  locale: StudioLocale,
  activeFloorId?: string,
): {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  designName: string;
  bim: BimModel;
} {
  const starter = buildStarterDesign(project, locale, rooms);
  const placed = enhanceDesignPlacement(project, rooms, starter.nodes, starter.edges, locale);
  const pack = buildBimOpenings(rooms, project, locale, activeFloorId);
  const nodes = mergeOpeningActuators(placed.nodes, pack.actuatorNodes);
  const controls = buildControlsForNodes(nodes, { ...placed.controls, ...pack.controls });
  return {
    nodes,
    edges: placed.edges,
    controls,
    designName: starter.name,
    bim: { walls: [], openings: pack.bim.openings, gardens: [] },
  };
}

/** Replace single center lights with calculated fixture grid + reposition HVAC from loads. */
export function enhanceDesignPlacement(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
  locale: StudioLocale = 'en',
): { nodes: DesignNode[]; edges: DesignEdge[]; controls: Record<string, ControlState> } {
  let nextNodes = [...nodes];
  let nextEdges = [...edges];
  const lightingReport = calculateLightingDesign(rooms);
  const lights = placeLightingFixtures(rooms, 'light', lightingReport);
  nextNodes = mergePlacementNodes(nextNodes, lights, 'light');
  const hvacNodes = placeHvacUnits(rooms, project);
  nextNodes = mergePlacementNodes(nextNodes, hvacNodes, 'hvac');
  nextNodes = mergeOutletNodes(nextNodes, [...placeSocketOutlets(rooms), ...placeAppliances(rooms)]);

  let smartControls: Record<string, ControlState> = {};
  if (project.smartBuilding && project.smartProtocol) {
    const smart = placeSmartChannelSystem(project, rooms, nextNodes, nextEdges, locale);
    nextNodes = smart.nodes;
    nextEdges = smart.edges;
    smartControls = smart.controls;
  }

  const roomControls = placeRoomControls(project, rooms, nextNodes, nextEdges, locale, lightingReport);
  nextNodes = roomControls.nodes;
  nextEdges = roomControls.edges;
  smartControls = { ...smartControls, ...roomControls.controls };

  nextNodes = labelCablesOnly(nextNodes);
  return { nodes: nextNodes, edges: nextEdges, controls: smartControls };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): DesignEdge {
  return { id: `e_${source}_${target}`, source, sourceHandle, target, targetHandle };
}

function roomAreaW(r: DesignRoom): number {
  const areaM2 = (r.width / 50) * (r.height / 50);
  return Math.round(Math.max(60, areaM2 * 8));
}

function pickAutoHvac(bt: ProjectInfo['buildingType']): HvacSystemType[] {
  if (bt === 'hotel' || bt === 'hospital' || bt === 'commercial') return ['vrf', 'ahu'];
  if (bt === 'industrial') return ['chiller', 'fcu'];
  if (bt === 'villa') return ['vrf', 'multi_split'];
  if (bt === 'house') return ['multi_split', 'split'];
  if (bt === 'apartment' || bt === 'residential') return ['multi_split'];
  return ['split'];
}

function buildingNameEn(bt: ProjectInfo['buildingType']): string {
  const m: Record<ProjectInfo['buildingType'], string> = {
    house: 'House',
    villa: 'Villa',
    apartment: 'Apartment',
    residential: 'Residential',
    commercial: 'Commercial',
    hotel: 'Hotel',
    hospital: 'Hospital',
    industrial: 'Industrial',
  };
  return m[bt];
}

function buildingNameAr(bt: ProjectInfo['buildingType']): string {
  const m: Record<ProjectInfo['buildingType'], string> = {
    house: 'منزل',
    villa: 'فيلا',
    apartment: 'شقة',
    residential: 'سكني',
    commercial: 'تجاري',
    hotel: 'فندق',
    hospital: 'مستشفى',
    industrial: 'صناعي',
  };
  return m[bt];
}
