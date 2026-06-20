/**
 * Floor-plan cable routes and conduit/pipe representation on maps.
 */
import type { CableSpec } from '../catalog';
import { getCatalogEntry } from '../catalog';
import type { DesignEdge, DesignNode, DesignRoom } from '../model';
import { routeCableSegments, totalRouteLengthM } from './cable-routing';

export type RoutePoint = { x: number; y: number };

export type ConduitType = 'conduit' | 'trunking' | 'surface' | 'underground' | 'bus' | 'data';

export type MapOverlayMode = 'plan' | 'cables' | 'pipes' | 'combined';

export const MAP_OVERLAY_MODES: MapOverlayMode[] = ['plan', 'cables', 'pipes', 'combined'];

export const CONDUIT_STYLE: Record<
  ConduitType,
  { outerPx: number; color: string; fill: string; dash?: string; label: string }
> = {
  conduit: { outerPx: 10, color: '#64748b', fill: 'rgba(100,116,139,0.25)', label: 'PVC conduit' },
  trunking: { outerPx: 14, color: '#475569', fill: 'rgba(71,85,105,0.3)', label: 'Cable trunking' },
  surface: { outerPx: 5, color: '#f59e0b', fill: 'rgba(245,158,11,0.15)', label: 'Surface run' },
  underground: { outerPx: 12, color: '#78716c', fill: 'rgba(120,113,108,0.2)', dash: '8 5', label: 'Underground' },
  bus: { outerPx: 7, color: '#16a34a', fill: 'rgba(22,163,74,0.2)', label: 'Bus cable' },
  data: { outerPx: 6, color: '#3b82f6', fill: 'rgba(59,130,246,0.2)', label: 'Data/control' },
};

export function conduitTypeForCable(entry: CableSpec): ConduitType {
  switch (entry.category) {
    case 'BUS':
      return 'bus';
    case 'DATA':
    case 'CONTROL':
    case 'FIRE_ALARM':
    case 'AV':
      return 'data';
    case 'MV':
      return 'trunking';
    default:
      return 'conduit';
  }
}

export function parseRoutePoints(params: DesignNode['params']): RoutePoint[] {
  const raw = params.routePoints;
  if (typeof raw === 'string' && raw.length > 2) {
    try {
      const parsed = JSON.parse(raw) as RoutePoint[];
      if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function serializeRoutePoints(points: RoutePoint[]): string {
  return JSON.stringify(points);
}

function nodeCenter(n: DesignNode): RoutePoint {
  const entry = getCatalogEntry(n.catalogId);
  const w = entry?.domain === 'cable' ? 40 : 42;
  const h = entry?.domain === 'cable' ? 18 : 42;
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

function segmentsToPoints(segments: ReturnType<typeof routeCableSegments>): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const seg of segments) {
    if (points.length === 0) points.push({ x: seg.x, y: seg.y });
    const rad = (seg.rotation * Math.PI) / 180;
    points.push({
      x: seg.x + Math.cos(rad) * seg.lengthM * 50,
      y: seg.y + Math.sin(rad) * seg.lengthM * 50,
    });
  }
  return points;
}

/** Build orthogonal floor-plan route between cable endpoints (or from cable pose). */
export function computeCableRoute(
  cableNode: DesignNode,
  nodes: DesignNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[],
): RoutePoint[] {
  const linkedIds = edges
    .filter((e) => e.source === cableNode.id || e.target === cableNode.id)
    .map((e) => (e.source === cableNode.id ? e.target : e.source));

  const endpoints = linkedIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is DesignNode => !!n && getCatalogEntry(n.catalogId)?.domain !== 'cable');

  if (endpoints.length >= 2) {
    const a = nodeCenter(endpoints[0]!);
    const b = nodeCenter(endpoints[1]!);
    return segmentsToPoints(routeCableSegments(a.x, a.y, b.x, b.y, rooms));
  }

  if (endpoints.length === 1) {
    const a = nodeCenter(endpoints[0]!);
    const b = nodeCenter(cableNode);
    return segmentsToPoints(routeCableSegments(a.x, a.y, b.x, b.y, rooms));
  }

  const len = Number(cableNode.params.lengthM ?? 20) * 50;
  const rot = (Number(cableNode.params.rotation ?? 0) * Math.PI) / 180;
  return [
    { x: cableNode.x, y: cableNode.y + 9 },
    { x: cableNode.x + Math.cos(rot) * len, y: cableNode.y + 9 + Math.sin(rot) * len },
  ];
}

export function routeLengthM(points: RoutePoint[]): number {
  let px = 0;
  for (let i = 1; i < points.length; i++) {
    px += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return Math.max(1, Math.round(px / 50));
}

export function boundingBox(points: RoutePoint[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 16;
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(40, maxX - minX + pad * 2),
    h: Math.max(24, maxY - minY + pad * 2),
  };
}

export function toLocalPoints(points: RoutePoint[], origin: RoutePoint): RoutePoint[] {
  return points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
}

export function toWorldPoints(local: RoutePoint[], origin: RoutePoint): RoutePoint[] {
  return local.map((p) => ({ x: p.x + origin.x, y: p.y + origin.y }));
}

export function formatCableLabel(
  roomLabel: string | undefined,
  entry: CableSpec,
  index: number,
  conduitType: ConduitType,
): string {
  const room = roomLabel ?? 'Circuit';
  const csa = entry.csaMm2 ? `${entry.csaMm2} mm²` : entry.model;
  const conduit = CONDUIT_STYLE[conduitType]?.label ?? conduitType;
  return `${room} · ${entry.category} ${csa} · C${index + 1} · ${conduit}`;
}

export function applyRouteToCable(
  cableNode: DesignNode,
  points: RoutePoint[],
  entry?: CableSpec,
): DesignNode['params'] {
  const lengthM = routeLengthM(points);
  const conduitType = (cableNode.params.conduitType as ConduitType | undefined) ?? (entry ? conduitTypeForCable(entry) : 'conduit');
  const roomLabel = typeof cableNode.params.roomLabel === 'string' ? cableNode.params.roomLabel : undefined;
  const circuitIdx = Number(cableNode.params.circuitIndex ?? 0);
  const autoLabel = entry ? formatCableLabel(roomLabel, entry, circuitIdx, conduitType) : cableNode.label;
  return {
    ...cableNode.params,
    routePoints: serializeRoutePoints(points),
    lengthM,
    conduitType,
    showOnMap: cableNode.params.showOnMap ?? true,
    cableLabel: autoLabel,
  };
}

export function rerouteCableNode(
  cableNode: DesignNode,
  nodes: DesignNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[],
): DesignNode {
  const entry = getCatalogEntry(cableNode.catalogId) as CableSpec | undefined;
  const points = computeCableRoute(cableNode, nodes, edges, rooms);
  const params = applyRouteToCable(cableNode, points, entry);
  return { ...cableNode, label: String(params.cableLabel ?? cableNode.label), params };
}

/** Cables that must be re-routed when a node moves (direct edge neighbors only). */
export function cableIdsLinkedToNode(nodeId: string, nodes: DesignNode[], edges: DesignEdge[]): Set<string> {
  const ids = new Set<string>();
  const self = nodes.find((n) => n.id === nodeId);
  if (self && getCatalogEntry(self.catalogId)?.domain === 'cable') {
    ids.add(nodeId);
    return ids;
  }
  for (const e of edges) {
    if (e.source !== nodeId && e.target !== nodeId) continue;
    const otherId = e.source === nodeId ? e.target : e.source;
    const other = nodes.find((n) => n.id === otherId);
    if (other && getCatalogEntry(other.catalogId)?.domain === 'cable') ids.add(otherId);
  }
  return ids;
}

/** Re-route and auto-label every cable in the design. */
export function labelAllDesignCables(
  nodes: DesignNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[],
): DesignNode[] {
  return nodes.map((n) =>
    getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, nodes, edges, rooms) : n,
  );
}
