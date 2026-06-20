/**
 * Per-room lighting switches (HDL dry contact / touch or conventional),
 * TV placement, and non-smart HVAC sized by light fixture count.
 */
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { calculateLightingDesign, type LightingDesignReport } from './lighting-design';
import { getCatalogEntry } from '../catalog';
import { defaultControlState, type ControlState } from '../controls';
import type { SmartHomeSpec } from '../catalog';

const SKIP_SWITCH_ZONES = new Set<string>(['corridor', 'mechanical', 'storage']);
const TV_ZONES = new Set<DesignRoom['zone']>(['general', 'bedroom', 'office', 'kitchen']);

function roomAreaM2(room: DesignRoom): number {
  return (room.width / 50) * (room.height / 50);
}

function switchPosition(room: DesignRoom): { x: number; y: number } {
  return {
    x: room.x + Math.max(12, Math.min(room.width / 2 - 21, room.width - 56)),
    y: room.y + room.height - 44,
  };
}

function tvPosition(room: DesignRoom): { x: number; y: number } {
  return {
    x: room.x + room.width - 80,
    y: room.y + room.height / 2 - 21,
  };
}

function hvacPosition(room: DesignRoom, index: number): { x: number; y: number } {
  return {
    x: room.x + room.width - 88,
    y: room.y + 16 + (index % 2) * 36,
  };
}

function lightingSwitchCatalog(project: ProjectInfo, room: DesignRoom): string {
  if (!project.smartBuilding) return 'load-light-switch';

  const useKnx = project.smartProtocol === 'KNX';
  const major =
    ['general', 'bedroom', 'office', 'kitchen'].includes(room.zone) ||
    roomAreaM2(room) >= 14 ||
    project.buildingType === 'hotel';

  if (major) return useKnx ? 'knx-touch' : 'hdl-touchscreen';
  return useKnx ? 'knx-input' : 'hdl-drycontact';
}

function switchProtocol(catalogId: string): 'HDL' | 'KNX' {
  return catalogId.startsWith('knx-') ? 'KNX' : 'HDL';
}

function hvacCatalogForLightCount(lightCount: number): string {
  if (lightCount <= 2) return 'hvac-split-3.5';
  if (lightCount <= 5) return 'hvac-fcu-5';
  if (lightCount <= 9) return 'hvac-split-3.5';
  return 'hvac-fcu-5';
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): DesignEdge {
  return { id: `e_${source}_${target}`, source, sourceHandle, target, targetHandle };
}

export function placeLightingSwitches(
  project: ProjectInfo,
  rooms: DesignRoom[],
  locale: StudioLocale,
  existingNodes: DesignNode[],
  lightingReport?: LightingDesignReport,
): { nodes: DesignNode[]; edges: DesignEdge[]; controls: Record<string, ControlState> } {
  const lighting = lightingReport ?? calculateLightingDesign(rooms);
  const lightByRoom = new Map(lighting.rooms.map((r) => [r.roomId, r.fixturesRecommended]));
  const nodes: DesignNode[] = [];
  const edges: DesignEdge[] = [];
  const controls: Record<string, ControlState> = {};

  for (const room of rooms) {
    const lightCount = lightByRoom.get(room.id) ?? 0;
    if (lightCount <= 0 || SKIP_SWITCH_ZONES.has(room.zone)) continue;

    const catalogId = lightingSwitchCatalog(project, room);
    const pos = switchPosition(room);
    const id = `sw_${room.id}`;
    const entry = getCatalogEntry(catalogId);
    const label =
      entry?.name[locale] ??
      entry?.name.en ??
      (project.smartBuilding ? 'Lighting switch' : 'Light switch');

    nodes.push({
      id,
      catalogId,
      label: `${label} · ${room.label}`,
      x: pos.x,
      y: pos.y,
      floorId: room.floorId,
      params: {
        roomId: room.id,
        showOnMap: true,
        controlsLighting: true,
        lightCount,
      },
    });

    if (entry && project.smartBuilding) {
      controls[id] = defaultControlState(entry);
      const protocol = switchProtocol(catalogId);
      const gw = existingNodes.find((n) => n.id === `gw_${protocol}`);
      if (gw) {
        edges.push(edge(id, 'bus', gw.id, 'bus'));
      }
    }
  }

  return { nodes, edges, controls };
}

export function placeTvUnits(rooms: DesignRoom[], locale: StudioLocale): DesignNode[] {
  const entry = getCatalogEntry('load-tv');
  const baseLabel = entry?.name[locale] ?? entry?.name.en ?? 'TV';

  return rooms
    .filter((r) => TV_ZONES.has(r.zone) && roomAreaM2(r) >= 8)
    .map((room) => {
      const pos = tvPosition(room);
      return {
        id: `tv_${room.id}`,
        catalogId: 'load-tv',
        label: `${baseLabel} · ${room.label}`,
        x: pos.x,
        y: pos.y,
        floorId: room.floorId,
        params: { roomId: room.id, showOnMap: true },
      };
    });
}

export function placeHvacUnitsByLightCount(rooms: DesignRoom[], project: ProjectInfo): DesignNode[] {
  const lighting = calculateLightingDesign(rooms);
  const nodes: DesignNode[] = [];

  lighting.rooms.forEach((row, index) => {
    if (row.fixturesRecommended <= 0) return;
    const room = rooms.find((r) => r.id === row.roomId);
    if (!room || room.zone === 'corridor' || room.zone === 'mechanical') return;

    const catalogId = hvacCatalogForLightCount(row.fixturesRecommended);
    const pos = hvacPosition(room, index);
    nodes.push({
      id: `hvac_auto_${room.id}`,
      catalogId,
      label: `AC · ${room.label} (${row.fixturesRecommended} lights)`,
      x: pos.x,
      y: pos.y,
      floorId: room.floorId,
      params: {
        roomId: room.id,
        showOnMap: true,
        hvacRole: 'cooling',
        lightCount: row.fixturesRecommended,
      },
    });
  });

  if (!nodes.length && rooms.length) {
    const room = rooms.find((r) => r.zone !== 'corridor' && r.zone !== 'mechanical') ?? rooms[0]!;
    const lightCount = lighting.rooms.find((r) => r.roomId === room.id)?.fixturesRecommended ?? 3;
    nodes.push({
      id: `hvac_auto_${room.id}`,
      catalogId: hvacCatalogForLightCount(lightCount),
      label: `AC · ${room.label}`,
      x: room.x + room.width - 88,
      y: room.y + 16,
      floorId: room.floorId,
      params: { roomId: room.id, showOnMap: true, lightCount },
    });
  }

  return nodes;
}

export function mergeRoomControlNodes(existing: DesignNode[], placed: DesignNode[], kind: 'switch' | 'tv'): DesignNode[] {
  const prefix = kind === 'switch' ? 'sw_' : 'tv_';
  const catalogIds =
    kind === 'switch'
      ? new Set(['load-light-switch', 'hdl-touchscreen', 'hdl-drycontact', 'hdl-dlp', 'knx-touch', 'knx-input'])
      : new Set(['load-tv']);
  const filtered = existing.filter((n) => {
    if (n.id.startsWith(prefix)) return false;
    if (kind === 'switch' && catalogIds.has(n.catalogId) && n.params.controlsLighting) return false;
    if (kind === 'tv' && n.catalogId === 'load-tv' && n.id.startsWith('tv_')) return false;
    return true;
  });
  return [...filtered, ...placed];
}

export function mergeRoomControlEdges(existing: DesignEdge[], placed: DesignEdge[]): DesignEdge[] {
  const switchEdgeTargets = new Set(placed.map((e) => e.target));
  const filtered = existing.filter((e) => !e.source.startsWith('sw_') || !switchEdgeTargets.has(e.target));
  return [...filtered, ...placed];
}

export function placeRoomControls(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
  locale: StudioLocale,
  lightingReport?: LightingDesignReport,
): { nodes: DesignNode[]; edges: DesignEdge[]; controls: Record<string, ControlState> } {
  const switches = placeLightingSwitches(project, rooms, locale, nodes, lightingReport);
  let nextNodes = mergeRoomControlNodes(nodes, switches.nodes, 'switch');
  nextNodes = mergeRoomControlNodes(nextNodes, placeTvUnits(rooms, locale), 'tv');
  let nextEdges = mergeRoomControlEdges(edges, switches.edges);
  const controls = { ...switches.controls };

  for (const n of switches.nodes) {
    const entry = getCatalogEntry(n.catalogId) as SmartHomeSpec | undefined;
    if (entry?.domain === 'smarthome' && !controls[n.id]) {
      controls[n.id] = defaultControlState(entry);
    }
  }

  return { nodes: nextNodes, edges: nextEdges, controls };
}
