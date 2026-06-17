/**
 * Live simulation metrics aggregated from per-node states.
 */
import type { ResolvedNode } from '../model';
import type { NodeSimState } from './simulate';
import { declarationFor } from './declarations';

export type SimulationMetrics = {
  totalKw: number;
  totalA: number;
  activeDevices: number;
  energisedDevices: number;
  byDomain: Record<string, { kw: number; count: number }>;
};

export function aggregateSimulation(
  nodes: ResolvedNode[],
  states: Record<string, NodeSimState>,
): SimulationMetrics {
  const byDomain: Record<string, { kw: number; count: number }> = {};
  let totalKw = 0;
  let totalA = 0;
  let activeDevices = 0;
  let energisedDevices = 0;

  for (const n of nodes) {
    const s = states[n.id];
    if (!s) continue;
    if (s.energised) energisedDevices++;
    if (!s.active) continue;
    activeDevices++;
    const decl = declarationFor(n.spec, n.params);
    const kw = (decl ? (decl.voltage * s.currentA) / 1000 : 0);
    totalKw += kw;
    totalA += s.currentA;
    const d = n.spec.domain;
    if (!byDomain[d]) byDomain[d] = { kw: 0, count: 0 };
    byDomain[d].kw += kw;
    byDomain[d].count++;
  }

  return { totalKw, totalA, activeDevices, energisedDevices, byDomain };
}
