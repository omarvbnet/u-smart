/**
 * Auto-placement of lighting fixtures and HVAC units from engineering calculations.
 */
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { ProjectInfo, HvacSystemType } from '../project';
import { calculateLightingDesign } from './lighting-design';
import { calculateHvacLoads, type HvacLoadReport } from './hvac-loads';
import { routeCableSegments } from './cable-routing';

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
): DesignNode[] {
  const report = calculateLightingDesign(rooms);
  const nodes: DesignNode[] = [];

  for (const row of report.rooms) {
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
        catalogId: 'load-lighting',
        label: `${room.label} L${i + 1}`,
        x: room.x + padX + col * cellW + cellW / 2 - 21,
        y: room.y + padY + rowIdx * cellH + cellH / 2 - 21,
        params: { powerW: Math.round(row.powerW / count) },
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
  const types = project.hvacMode === 'auto' ? loads.recommendedSystems : project.hvacTypes;
  const catalogId = HVAC_CATALOG[types[0] ?? 'split'] ?? 'hvac-split-3.5';
  const nodes: DesignNode[] = [];

  const mechanical = rooms.find((r) => r.zone === 'mechanical');
  const targets = loads.rooms.filter((r) => r.coolingKw >= 1.5);

  targets.forEach((load, i) => {
    const room = rooms.find((r) => r.id === load.roomId);
    if (!room) return;
    const anchor = mechanical ?? room;
    nodes.push({
      id: `hvac_auto_${load.roomId}`,
      catalogId,
      label: `HVAC ${room.label}`,
      x: anchor.x + anchor.width - 88 + (i % 2) * 44,
      y: anchor.zone === 'mechanical' ? anchor.y + 24 + i * 72 : room.y + 16,
      params: {},
    });
  });

  if (!nodes.length && rooms.length) {
    const r = rooms[0]!;
    nodes.push({
      id: 'hvac_auto_0',
      catalogId,
      label: 'HVAC',
      x: r.x + r.width - 88,
      y: r.y + 16,
      params: {},
    });
  }

  return nodes;
}

export function mergePlacementNodes(existing: DesignNode[], placed: DesignNode[], domain: 'light' | 'hvac'): DesignNode[] {
  const prefix = domain === 'light' ? 'light_' : 'hvac_auto_';
  const filtered = existing.filter((n) => !n.id.startsWith(prefix) && !(domain === 'light' && n.catalogId === 'load-lighting' && n.id.startsWith('load_')));
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
    nodePush({
      id: cableId,
      catalogId: 'cable-lv-cu-2.5',
      label: `${room.label} cable ${idx + 1}`,
      x: seg.x,
      y: seg.y,
      params: { lengthM: segs.reduce((s, x) => s + x.lengthM, 0), rotation: seg.rotation },
    });
    edgePush(edgeFn(mcbId, 'load', cableId, 'a'));
    edgePush(edgeFn(cableId, 'b', load.id, 'in'));
  });
}
