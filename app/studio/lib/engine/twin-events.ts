/**
 * Event-driven digital twin chain: panel → actuator → load → circuit metrics.
 */
import { getCatalogEntry } from '../catalog';
import type { CatalogEntry } from '../catalog';
import type { DesignEdge, DesignNode } from '../model';
import { resolveNodes } from '../model';
import type { ControlState } from '../controls';
import { assignAddresses, makeTelegram, type Telegram } from './bus';
import { simulate, type NodeSimState } from './simulate';
import { aggregateSimulation } from './sim-metrics';
import type { TwinChainStep, TwinMetrics } from '@/lib/studio-simulation-hub';

function adjacency(edges: DesignEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  return adj;
}

function bfsFrom(startId: string, adj: Map<string, Set<string>>, filter: (id: string) => boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (filter(next)) out.push(next);
      queue.push(next);
    }
  }
  return out;
}

function labelFor(entry: CatalogEntry | undefined, node: DesignNode): string {
  return node.label || entry?.name.en || node.id;
}

export function buildControlChain(nodes: DesignNode[], edges: DesignEdge[], originId: string): TwinChainStep[] {
  const resolved = resolveNodes(nodes, getCatalogEntry);
  const byId = new Map(resolved.map((n) => [n.id, n]));
  const origin = byId.get(originId);
  if (!origin) return [];

  const adj = adjacency(edges);
  const steps: TwinChainStep[] = [];
  const originEntry = origin.spec;

  steps.push({
    kind: 'panel',
    nodeId: origin.id,
    label: labelFor(originEntry, origin),
    detail:
      originEntry.domain === 'sensor'
        ? 'Sensor trigger'
        : originEntry.domain === 'smarthome'
          ? 'Touch panel / logic'
          : 'Control input',
  });

  const actuators = bfsFrom(originId, adj, (id) => {
    const n = byId.get(id);
    return !!n && (n.spec.domain === 'smarthome' || n.spec.domain === 'protection');
  }).filter((id) => id !== originId);

  for (const id of actuators.slice(0, 6)) {
    const n = byId.get(id)!;
    steps.push({
      kind: 'actuator',
      nodeId: id,
      label: labelFor(n.spec, n),
      detail: n.spec.domain === 'protection' ? 'Breaker state' : 'Bus actuator',
    });
  }

  const loads = bfsFrom(originId, adj, (id) => {
    const n = byId.get(id);
    return !!n && (n.spec.domain === 'load' || n.spec.domain === 'hvac');
  });

  for (const id of loads.slice(0, 8)) {
    const n = byId.get(id)!;
    steps.push({
      kind: 'load',
      nodeId: id,
      label: labelFor(n.spec, n),
      detail: n.spec.domain === 'hvac' ? 'HVAC load response' : 'Lighting / power load',
    });
  }

  if (loads.length) {
    steps.push({
      kind: 'circuit',
      nodeId: loads[0]!,
      label: 'Circuit path',
      detail: `${loads.length} load(s) reachable from control origin`,
    });
  }

  return steps;
}

export function runTwinTick(
  nodes: DesignNode[],
  edges: DesignEdge[],
  controls: Record<string, ControlState>,
): { states: Record<string, NodeSimState>; metrics: TwinMetrics } {
  const resolved = resolveNodes(nodes, getCatalogEntry);
  const states = simulate(resolved, edges, controls);
  const agg = aggregateSimulation(resolved, states);
  return {
    states,
    metrics: {
      totalKw: agg.totalKw,
      totalA: agg.totalA,
      activeDevices: agg.activeDevices,
      energisedDevices: agg.energisedDevices,
    },
  };
}

export function processTwinControl(
  nodes: DesignNode[],
  edges: DesignEdge[],
  nodeId: string,
  key: string,
  value: boolean | number,
): { chain: TwinChainStep[]; telegram?: Telegram } {
  const chain = buildControlChain(nodes, edges, nodeId);
  const node = nodes.find((n) => n.id === nodeId);
  const entry = node ? getCatalogEntry(node.catalogId) : undefined;
  let telegram: Telegram | undefined;
  if (entry && (entry.domain === 'smarthome' || entry.domain === 'sensor')) {
    const addr = assignAddresses(nodes).get(nodeId);
    if (addr) telegram = makeTelegram(entry, addr, key, value);
  }
  if (chain.length && (value === true || (typeof value === 'number' && value > 0))) {
    chain.push({
      kind: 'metric',
      nodeId,
      label: 'Live metrics',
      detail: `Control ${key}=${value} propagated`,
    });
  }
  return { chain, telegram };
}
