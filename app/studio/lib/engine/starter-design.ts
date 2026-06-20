/**
 * Generate an initial engineering layout from wizard selections + optional rooms.
 */
import type { DesignNode, DesignEdge, DesignRoom } from '../model';
import type { ProjectInfo, HvacSystemType } from '../project';
import type { StudioLocale } from '../i18n';
import { cableRunRouted } from './cable-routing';
import { placeLightingFixtures, placeHvacUnits, mergePlacementNodes } from './placement-layout';

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
  const targets = rooms.length > 0 ? rooms : defaultRooms(bt);
  const minRoomX = targets.length ? Math.min(...targets.map((r) => r.x)) : 0;
  const yBase = targets.length ? Math.min(...targets.map((r) => r.y)) + 40 : 200;
  let xSource = minRoomX - 200;

  // Primary energy sources from wizard
  project.energySources.forEach((src, i) => {
    const catalogId = SOURCE_CATALOG[src];
    if (!catalogId) return;
    const id = `src_${src}`;
    nodes.push({ id, catalogId, label: src, x: xSource, y: yBase + i * 120, params: {} });
  });

  const mainId = 'panel_main';
  nodes.push({ id: mainId, catalogId: 'load-distribution-board', label: 'Main DB', x: minRoomX - 80, y: yBase + 40, params: {} });

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

    nodes.push({ id: mcbId, catalogId: 'mcb-c10', label: `${room.label} MCB`, x: mcbX, y: mcbY, params: {} });
    nodes.push({
      id: cableId,
      catalogId: 'cable-lv-cu-2.5',
      label: `${room.label} cable`,
      x: run.x,
      y: run.y,
      params: { lengthM: run.lengthM, rotation: run.rotation },
    });
    nodes.push({ id: lightId, catalogId: 'load-lighting', label: room.label, x: loadX, y: loadY, params: { powerW: roomAreaW(room) } });

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

    nodes.push({ id: mcbId, catalogId: 'mcb-c16', label: 'HVAC MCB', x: mcbX, y: mcbY, params: {} });
    nodes.push({
      id: cableId,
      catalogId: 'cable-lv-cu-4',
      label: 'HVAC cable',
      x: hvacRun.x,
      y: hvacRun.y,
      params: { lengthM: hvacRun.lengthM, rotation: hvacRun.rotation },
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
      const room = targets[0];
      nodes.push({
        id: gwId,
        catalogId,
        label: `${proto} Gateway`,
        x: room ? room.x + 20 : 100,
        y: room ? room.y + room.height - 60 : 520 + i * 80,
        params: {},
      });
    });
  }

  return { nodes, edges, name: names[locale] };
}

/** Replace single center lights with calculated fixture grid + reposition HVAC from loads. */
export function enhanceDesignPlacement(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
): { nodes: DesignNode[]; edges: DesignEdge[] } {
  let nextNodes = [...nodes];
  const lights = placeLightingFixtures(rooms);
  nextNodes = mergePlacementNodes(nextNodes, lights, 'light');
  const hvacNodes = placeHvacUnits(rooms, project);
  nextNodes = mergePlacementNodes(nextNodes, hvacNodes, 'hvac');
  return { nodes: nextNodes, edges };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): DesignEdge {
  return { id: `e_${source}_${target}`, source, sourceHandle, target, targetHandle };
}

function defaultRooms(bt: ProjectInfo['buildingType']): DesignRoom[] {
  if (bt === 'apartment' || bt === 'house') {
    return [
      room('living', 'Living', -200, -120, 280, 200),
      room('kitchen', 'Kitchen', 100, -120, 180, 140),
      room('bed1', 'Bedroom', -200, 100, 200, 160),
    ];
  }
  return [
    room('lobby', 'Lobby', -240, -160, 320, 180),
    room('office', 'Office', 100, -160, 220, 180),
    room('mech', 'MEP Room', -240, 40, 160, 140),
  ];
}

function room(id: string, label: string, x: number, y: number, width: number, height: number): DesignRoom {
  return { id, label, x, y, width, height, zone: 'general' };
}

function roomAreaW(r: DesignRoom): number {
  const areaM2 = (r.width / 50) * (r.height / 50);
  return Math.round(Math.max(60, areaM2 * 8));
}

function pickAutoHvac(bt: ProjectInfo['buildingType']): HvacSystemType[] {
  if (bt === 'hotel' || bt === 'hospital' || bt === 'commercial') return ['vrf', 'ahu'];
  if (bt === 'industrial') return ['chiller', 'fcu'];
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
