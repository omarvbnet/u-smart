/**
 * Per-room lighting, socket, and appliance circuits — sized for Iraq / IEC 60364.
 */
import type { CableSpec, LoadSpec } from '../catalog';
import { getCatalogEntry } from '../catalog';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { loadCurrent } from './electrical';
import {
  IRAQ_SUPPLY,
  cableCatalogIdForCurrent,
  mcbCatalogIdForCurrent,
  withIraqElectricalStandards,
} from './iraq-electrical';
import { calculateLightingDesign } from './lighting-design';
import { placeLightingFixtures, placeHvacUnits, mergePlacementNodes } from './placement-layout';
import { placeSocketOutlets, placeAppliances, mergeOutletNodes } from './outlet-placement';
import { routeCableSegments } from './cable-routing';
import { formatCableLabel, conduitTypeForCable } from './cable-map';
import { placeSmartChannelSystem } from './smart-channel-layout';
import { placeRoomControls } from './room-controls-layout';
import type { ControlState } from '../controls';
import { defaultControlState } from '../controls';

const LIGHT_CATALOG = /^(load-lighting|load-downlight|load-linear|load-spot|load-magnetic)$/;

function isLightNode(n: DesignNode): boolean {
  return LIGHT_CATALOG.test(n.catalogId);
}

function isSocketNode(n: DesignNode): boolean {
  return getCatalogEntry(n.catalogId)?.category === 'SOCKET';
}

function isApplianceNode(n: DesignNode): boolean {
  return getCatalogEntry(n.catalogId)?.category === 'APPLIANCE';
}

function isHvacNode(n: DesignNode): boolean {
  return getCatalogEntry(n.catalogId)?.domain === 'hvac';
}

function nodeInRoom(n: DesignNode, room: DesignRoom): boolean {
  if (n.params.roomId === room.id) return true;
  const cx = n.x + 21;
  const cy = n.y + 21;
  return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
}

function designCurrentW(loads: DesignNode[]): number {
  let watts = 0;
  for (const n of loads) {
    const entry = getCatalogEntry(n.catalogId);
    if (!entry || entry.domain !== 'load') continue;
    const spec = entry as LoadSpec;
    const p = Number(n.params.powerW) || spec.powerW;
    watts += p * (spec.demandFactor ?? 1);
  }
  return loadCurrent(watts, IRAQ_SUPPLY.voltage, IRAQ_SUPPLY.phases, IRAQ_SUPPLY.powerFactor);
}

type CircuitGroup = { suffix: string; label: string; loads: DesignNode[] };

function circuitGroupsForRoom(room: DesignRoom, nodes: DesignNode[]): CircuitGroup[] {
  const inRoom = nodes.filter((n) => {
    if (isHvacNode(n)) return false;
    if (getCatalogEntry(n.catalogId)?.domain === 'cable') return false;
    if (getCatalogEntry(n.catalogId)?.domain === 'protection') return false;
    if (getCatalogEntry(n.catalogId)?.domain === 'source') return false;
    return nodeInRoom(n, room);
  });

  const lights = inRoom.filter(isLightNode);
  const sockets = inRoom.filter(isSocketNode);
  const appliances = inRoom.filter(isApplianceNode);

  const groups: CircuitGroup[] = [];
  if (lights.length) groups.push({ suffix: 'lt', label: 'Lighting', loads: lights });
  if (sockets.length) groups.push({ suffix: 'sk', label: 'Sockets', loads: sockets });
  if (appliances.length) groups.push({ suffix: 'ap', label: 'Appliances', loads: appliances });
  return groups;
}

function stripRoomCircuits(nodes: DesignNode[], edges: DesignEdge[], roomIds: Set<string>): { nodes: DesignNode[]; edges: DesignEdge[] } {
  const removeIds = new Set<string>();
  for (const n of nodes) {
    if (getCatalogEntry(n.catalogId)?.domain === 'protection') {
      for (const rid of roomIds) {
        if (n.id === `mcb_${rid}` || n.id.startsWith(`mcb_${rid}_`)) removeIds.add(n.id);
      }
    }
    if (getCatalogEntry(n.catalogId)?.domain === 'cable') {
      for (const rid of roomIds) {
        if (n.id === `cable_${rid}` || n.id.startsWith(`cable_${rid}_`)) removeIds.add(n.id);
      }
    }
    if (n.id.startsWith('load_') && roomIds.has(n.id.replace('load_', ''))) removeIds.add(n.id);
  }
  const nextNodes = nodes.filter((n) => !removeIds.has(n.id));
  const nextEdges = edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target));
  return { nodes: nextNodes, edges: nextEdges };
}

function wireCircuitGroup(
  panelId: string,
  room: DesignRoom,
  group: CircuitGroup,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
): void {
  const designA = Math.max(1, designCurrentW(group.loads));
  const cableCatalogId = cableCatalogIdForCurrent(designA);
  const cableEntry = getCatalogEntry(cableCatalogId) as CableSpec;
  const mcbCatalogId = mcbCatalogIdForCurrent(designA, cableEntry.ampacityA);

  const mcbId = `mcb_${room.id}_${group.suffix}`;
  const mcbX = room.x + 8;
  const mcbY = room.y + 8 + (group.suffix === 'sk' ? 28 : group.suffix === 'ap' ? 56 : 0);

  nodes.push({
    id: mcbId,
    catalogId: mcbCatalogId,
    label: `${room.label} ${group.label}`,
    x: mcbX,
    y: mcbY,
    floorId: room.floorId,
    params: { roomId: room.id, designA: Math.round(designA * 10) / 10 },
  });
  edges.push({ id: `e_${panelId}_${mcbId}`, source: panelId, sourceHandle: 'out', target: mcbId, targetHandle: 'line' });

  group.loads.forEach((load, idx) => {
    const cableId = `cable_${room.id}_${group.suffix}_${idx}`;
    const segs = routeCableSegments(mcbX, mcbY, load.x + 21, load.y + 21, rooms);
    const seg = segs[0]!;
    const conduitType = conduitTypeForCable(cableEntry);
    const label = formatCableLabel(room.label, cableEntry, idx, conduitType);
    nodes.push({
      id: cableId,
      catalogId: cableCatalogId,
      label,
      x: seg.x,
      y: seg.y,
      floorId: room.floorId,
      params: {
        lengthM: segs.reduce((s, x) => s + x.lengthM, 0),
        rotation: seg.rotation,
        roomId: room.id,
        roomLabel: room.label,
        circuitIndex: idx,
        conduitType,
        showOnMap: true,
        designA: Math.round(designA * 10) / 10,
      },
    });
    edges.push({ id: `e_${mcbId}_${cableId}`, source: mcbId, sourceHandle: 'load', target: cableId, targetHandle: 'a' });
    edges.push({ id: `e_${cableId}_${load.id}`, source: cableId, sourceHandle: 'b', target: load.id, targetHandle: 'in' });
  });
}

/** Place lights, sockets, appliances per room and wire IEC-sized circuits from the main panel. */
export function attachRoomElectricalDistribution(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
): { nodes: DesignNode[]; edges: DesignEdge[] } {
  const panel =
    nodes.find((n) => n.id === 'panel_main') ??
    nodes.find((n) => n.catalogId === 'load-distribution-board');
  if (!panel) return { nodes, edges };

  const roomIds = new Set(rooms.map((r) => r.id));
  let nextNodes = [...nodes];
  let nextEdges = [...edges];
  const stripped = stripRoomCircuits(nextNodes, nextEdges, roomIds);
  nextNodes = stripped.nodes;
  nextEdges = stripped.edges;

  for (const room of rooms) {
    const groups = circuitGroupsForRoom(room, nextNodes);
    for (const group of groups) {
      wireCircuitGroup(panel.id, room, group, rooms, nextNodes, nextEdges);
    }
  }

  return { nodes: nextNodes, edges: nextEdges };
}

/** Full per-space redistribution: fixtures, outlets, materials wiring (map import / replan). */
export function redistributeDesignForRooms(
  project: ProjectInfo,
  rooms: DesignRoom[],
  nodes: DesignNode[],
  edges: DesignEdge[],
  locale: StudioLocale,
): {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
} {
  const proj = withIraqElectricalStandards(project);
  const lightingReport = calculateLightingDesign(rooms);

  let nextNodes = [...nodes];
  let nextEdges = [...edges];

  const lights = placeLightingFixtures(rooms, 'light', lightingReport);
  nextNodes = mergePlacementNodes(nextNodes, lights, 'light');
  const hvacNodes = placeHvacUnits(rooms, proj);
  nextNodes = mergePlacementNodes(nextNodes, hvacNodes, 'hvac');
  nextNodes = mergeOutletNodes(nextNodes, [...placeSocketOutlets(rooms), ...placeAppliances(rooms)]);

  let controls: Record<string, ControlState> = {};
  if (proj.smartBuilding && proj.smartProtocol) {
    const smart = placeSmartChannelSystem(proj, rooms, nextNodes, nextEdges, locale);
    nextNodes = smart.nodes;
    nextEdges = smart.edges;
    controls = smart.controls;
  }

  const roomControls = placeRoomControls(proj, rooms, nextNodes, nextEdges, locale, lightingReport);
  nextNodes = roomControls.nodes;
  nextEdges = roomControls.edges;
  controls = { ...controls, ...roomControls.controls };

  const wired = attachRoomElectricalDistribution(proj, rooms, nextNodes, nextEdges);
  nextNodes = wired.nodes;
  nextEdges = wired.edges;

  for (const n of nextNodes) {
    if (controls[n.id]) continue;
    const entry = getCatalogEntry(n.catalogId);
    if (
      entry &&
      (entry.domain === 'load' ||
        entry.domain === 'smarthome' ||
        entry.domain === 'hvac' ||
        entry.domain === 'protection' ||
        entry.category === 'APPLIANCE' ||
        entry.category === 'SOCKET')
    ) {
      controls[n.id] = defaultControlState(entry);
    }
  }

  return { nodes: nextNodes, edges: nextEdges, controls };
}
