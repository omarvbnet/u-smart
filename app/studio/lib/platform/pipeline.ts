/**
 * Autonomous engineering pipeline — orchestrates rule-based engines into execution-ready deliverables.
 * AI/LLM must NOT perform calculations; only this deterministic chain does.
 */
import { getCatalogEntry } from '../catalog';
import { blankFloorPlanDataUrl, floorPlanSizeForBuilding } from '../blank-floor-plan';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import type { StudioLocale } from '../i18n';
import type { ProjectInfo } from '../project';
import { buildStarterDesign, enhanceDesignPlacement } from '../engine/starter-design';
import { calculateHvacLoads, type HvacLoadReport } from '../engine/hvac-loads';
import { calculateLightingDesign, type LightingDesignReport } from '../engine/lighting-design';
import { buildSmartTopology, type SmartTopologyReport } from '../engine/smarthome-topology';
import { buildBoq } from '../engine/reports';
import { resolveNodes } from '../model';
import { defaultControlState } from '../controls';
import type { ControlState } from '../controls';
import type { MapBackground } from '../store';

export type AutonomousDeliverables = {
  project: ProjectInfo;
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms: DesignRoom[];
  controls: Record<string, ControlState>;
  map: MapBackground | null;
  hvac: HvacLoadReport;
  lighting: LightingDesignReport;
  smart: SmartTopologyReport;
  boqGrandTotal: number;
  assumptions: string[];
};

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export function runAutonomousPipeline(
  project: ProjectInfo,
  roomBlueprints: Omit<DesignRoom, 'id'>[],
  locale: StudioLocale,
): AutonomousDeliverables {
  const rooms: DesignRoom[] = roomBlueprints.map((r) => ({ ...r, id: uid('room') }));
  const assumptions: string[] = [];

  const hvac = calculateHvacLoads(rooms, project.buildingType);
  const lighting = calculateLightingDesign(rooms);
  assumptions.push(...hvac.assumptions, ...lighting.assumptions);

  const starter = buildStarterDesign(project, locale, rooms);
  const placed = enhanceDesignPlacement(project, rooms, starter.nodes, starter.edges);
  let map: MapBackground | null = null;
  if (project.floorPlanSource === 'zero') {
    const { width, height } = floorPlanSizeForBuilding(project.buildingType);
    map = {
      src: blankFloorPlanDataUrl(width, height),
      width,
      height,
      x: -width / 2,
      y: -height / 2,
      opacity: 1,
      mode: 'blank',
    };
  }

  const smart = buildSmartTopology(project, placed.nodes, placed.edges, rooms);
  assumptions.push(...smart.assumptions);

  const resolved = resolveNodes(placed.nodes, getCatalogEntry);
  const boq = buildBoq(resolved);

  const controls: Record<string, ControlState> = {};
  for (const n of placed.nodes) {
    const entry = getCatalogEntry(n.catalogId);
    if (entry) controls[n.id] = defaultControlState(entry);
  }

  return {
    project,
    designName: starter.name,
    nodes: placed.nodes,
    edges: placed.edges,
    rooms,
    controls,
    map,
    hvac,
    lighting,
    smart,
    boqGrandTotal: boq.grandTotal,
    assumptions,
  };
}
