/**
 * Shared validation cache — one compute pass per design revision for all UI consumers.
 */
import { getCatalogEntry, type CableSpec } from './catalog';
import { CABLES } from './catalog/cables';
import type { DesignEdge, DesignNode, DesignRoom } from './model';
import { resolveNodes } from './model';
import { validateDesign, type Issue } from './engine/validation';
import { validatePlacement } from './engine/placement-validation';
import { validateLightingDesign } from './engine/lighting-validation';
import { suggestSmartFixes } from './engine/autofix';
import { computeQuality, computeCompliance, type QualityReport, type ComplianceRow } from './engine/quality';
import type { ProjectInfo } from './project';

export type DesignAnalysis = {
  issues: Issue[];
  byNode: Map<string, Issue[]>;
  quality: QualityReport;
  compliance: ComplianceRow[];
};

type CacheEntry = { key: string; result: DesignAnalysis };
type InputRefs = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms: DesignRoom[];
  project: ProjectInfo;
  activeFloorId: string;
};

let cache: CacheEntry | null = null;
let lastInputs: InputRefs | null = null;

function fingerprint(
  nodes: DesignNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[],
  project: ProjectInfo,
  activeFloorId: string,
): string {
  let h = 2166136261;
  const mix = (v: number) => {
    h ^= v;
    h = Math.imul(h, 16777619);
  };
  mix(nodes.length);
  mix(edges.length);
  mix(rooms.length);
  mix(activeFloorId.length);
  mix(project.smartBuilding ? 1 : 0);
  mix(project.buildingType.length);
  for (const r of rooms) {
    mix(r.width | 0);
    mix(r.height | 0);
    mix(r.zone?.length ?? 0);
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    mix(n.x | 0);
    mix(n.y | 0);
    mix(n.catalogId.length);
    for (const k of Object.keys(n.params)) {
      mix(k.length);
      const v = n.params[k];
      if (typeof v === 'number') mix(v | 0);
      else if (typeof v === 'string') mix(v.length);
      else if (typeof v === 'boolean') mix(v ? 1 : 0);
    }
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    mix(e.source.length);
    mix(e.target.length);
    mix(e.sourceHandle?.length ?? 0);
    mix(e.targetHandle?.length ?? 0);
    mix(e.cableId?.length ?? 0);
  }
  return `${h >>> 0}`;
}

export function computeDesignAnalysis(
  nodes: DesignNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[],
  project: ProjectInfo,
  activeFloorId: string,
): DesignAnalysis {
  if (
    cache &&
    lastInputs &&
    lastInputs.nodes === nodes &&
    lastInputs.edges === edges &&
    lastInputs.rooms === rooms &&
    lastInputs.project === project &&
    lastInputs.activeFloorId === activeFloorId
  ) {
    return cache.result;
  }

  const key = fingerprint(nodes, edges, rooms, project, activeFloorId);
  if (cache?.key === key) {
    lastInputs = { nodes, edges, rooms, project, activeFloorId };
    return cache.result;
  }

  const resolved = resolveNodes(nodes, getCatalogEntry);
  const activeRooms = rooms.filter((r) => !r.floorId || r.floorId === activeFloorId);
  const activeResolved = resolved.filter((n) => !n.floorId || n.floorId === activeFloorId);
  const floorNodes = nodes.filter((n) => !n.floorId || n.floorId === activeFloorId);

  const { issues: engIssues } = validateDesign(activeResolved, edges, CABLES as CableSpec[]);
  const placeIssues = validatePlacement(floorNodes, activeRooms, getCatalogEntry);
  const lightingIssues = validateLightingDesign(activeResolved, activeRooms);
  const smartIssues = suggestSmartFixes(project, nodes, edges, activeRooms);
  const merged = [...engIssues, ...placeIssues, ...lightingIssues, ...smartIssues];
  const seen = new Set<string>();
  const issues = merged.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const byNode = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!i.nodeId) continue;
    const arr = byNode.get(i.nodeId) ?? [];
    arr.push(i);
    byNode.set(i.nodeId, arr);
  }

  const result: DesignAnalysis = {
    issues,
    byNode,
    quality: computeQuality(issues, resolved.length),
    compliance: computeCompliance(issues),
  };
  cache = { key, result };
  lastInputs = { nodes, edges, rooms, project, activeFloorId };
  return result;
}

export function invalidateDesignAnalysisCache(): void {
  cache = null;
  lastInputs = null;
}
