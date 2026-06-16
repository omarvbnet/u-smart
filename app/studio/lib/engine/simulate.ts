/**
 * U Smart Studio — live building simulation.
 *
 * Computes which nodes are energised (reachable from an ON source through
 * CLOSED breakers along power/bus links) and which are actively operating
 * (energised AND switched on by their control), plus the current each active
 * element draws.
 */
import type { ResolvedNode, DesignEdge } from '../model';
import type { ControlState } from '../controls';
import { declarationFor } from './declarations';

export type NodeSimState = {
  energised: boolean;
  active: boolean;
  currentA: number;
  voltageV: number;
};

export function simulate(
  nodes: ResolvedNode[],
  edges: DesignEdge[],
  controls: Record<string, ControlState>,
): Record<string, NodeSimState> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const isClosedBreaker = (n: ResolvedNode) =>
    n.spec.domain !== 'protection' ||
    n.spec.domain === 'protection' && (controls[n.id]?.on ?? true);

  // BFS energisation from each ON source. A path is blocked by an OPEN breaker.
  const energised = new Set<string>();
  const sources = nodes.filter((n) => n.spec.domain === 'source' && (controls[n.id]?.on ?? true));
  const queue: string[] = [];
  for (const s of sources) {
    energised.add(s.id);
    queue.push(s.id);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (energised.has(next)) continue;
      const node = byId.get(next);
      if (!node) continue;
      // Cannot pass *through* an open breaker.
      if (node.spec.domain === 'protection' && !isClosedBreaker(node)) {
        // The breaker itself is energised on its line side but blocks downstream.
        energised.add(next);
        continue;
      }
      energised.add(next);
      queue.push(next);
    }
  }

  const out: Record<string, NodeSimState> = {};
  for (const n of nodes) {
    const en = energised.has(n.id);
    const ctrl = controls[n.id] ?? {};
    const decl = declarationFor(n.spec);
    let active = false;
    let currentA = 0;
    const voltageV = decl?.voltage ?? 0;

    switch (n.spec.domain) {
      case 'source':
        active = ctrl.on ?? true;
        currentA = active ? decl?.current ?? 0 : 0;
        break;
      case 'protection':
        active = en && (ctrl.on ?? true) && n.spec.protectionType !== 'SPD';
        break;
      case 'load':
      case 'hvac': {
        const on = ctrl.on ?? true;
        const level = ctrl.level ?? 100;
        active = en && on;
        currentA = active ? (decl?.current ?? 0) * (level / 100) : 0;
        break;
      }
      case 'smarthome': {
        const on = ctrl.on ?? ctrl.active ?? false;
        const level = ctrl.level;
        active = en && (on || (level != null && level > 0));
        currentA = active ? (decl?.current ?? 0) : 0;
        break;
      }
      case 'sensor':
        active = en && (ctrl.active ?? false);
        currentA = en ? decl?.current ?? 0 : 0;
        break;
      default:
        active = en;
    }

    out[n.id] = { energised: en, active, currentA, voltageV };
  }
  return out;
}
