/**
 * U Smart Studio — engineering report builders (BOQ, load/cable/panel schedules).
 * Pure functions over the resolved design.
 */
import type { CableSpec, ProtectionSpec, LoadSpec, HvacSpec } from '../catalog';
import type { ResolvedNode, DesignEdge, DesignNode } from '../model';
import { loadCurrent, voltageDropPercent } from './electrical';
import { declarationFor } from './declarations';

export type BoqRow = {
  model: string;
  name: string;
  manufacturer: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export function buildBoq(nodes: ResolvedNode[]): { rows: BoqRow[]; grandTotal: number } {
  const map = new Map<string, BoqRow>();
  for (const n of nodes) {
    const s = n.spec;
    const isCable = s.domain === 'cable';
    const qty = isCable ? Number((n.params as DesignNode['params']).lengthM ?? 20) : 1;
    const unitCost = isCable ? (s as CableSpec).costPerMeter : estimateCost(s);
    const key = s.id;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += qty;
      existing.total = existing.quantity * existing.unitCost;
    } else {
      map.set(key, {
        model: s.model,
        name: s.name.en,
        manufacturer: s.manufacturer,
        unit: isCable ? 'm' : 'pc',
        quantity: qty,
        unitCost,
        total: qty * unitCost,
      });
    }
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { rows, grandTotal };
}

/** Rough catalogue costs for non-cable items (illustrative). */
function estimateCost(s: ResolvedNode['spec']): number {
  switch (s.domain) {
    case 'protection': {
      const p = s as ProtectionSpec;
      const base = { MCB: 12, RCBO: 45, RCCB: 60, MCCB: 180, ACB: 1800, MPCB: 55, FUSE: 8, SPD: 120 }[p.protectionType] ?? 20;
      return base + p.ratedCurrentA * 0.4;
    }
    case 'source':
      return s.ratedKva * 120;
    case 'hvac':
      return s.coolingKw * 220 + 150;
    case 'load':
      return s.category === 'PANEL' ? 600 : 60;
    case 'sensor':
      return 45;
    case 'smarthome':
      return s.channelCurrentA != null ? 90 + s.channels * 12 : 140;
    default:
      return 50;
  }
}

export type LoadRow = {
  tag: string;
  name: string;
  powerW: number;
  voltage: number;
  phases: number;
  current: number;
  pf: number;
};

export function buildLoadSchedule(nodes: ResolvedNode[]): { rows: LoadRow[]; totalKw: number; totalA: number } {
  const rows: LoadRow[] = [];
  let totalW = 0;
  let totalA = 0;
  nodes.forEach((n) => {
    if (n.spec.domain === 'load') {
      const l = n.spec as LoadSpec;
      const i = loadCurrent(l.powerW, l.voltage, l.phases, l.powerFactor);
      rows.push({ tag: n.id.slice(-4).toUpperCase(), name: l.name.en, powerW: l.powerW, voltage: l.voltage, phases: l.phases, current: i, pf: l.powerFactor });
      totalW += l.powerW;
      totalA += i;
    } else if (n.spec.domain === 'hvac') {
      const h = n.spec as HvacSpec;
      const i = loadCurrent(h.inputKw * 1000, h.voltage, h.phases, 0.9);
      rows.push({ tag: n.id.slice(-4).toUpperCase(), name: h.name.en, powerW: h.inputKw * 1000, voltage: h.voltage, phases: h.phases, current: i, pf: 0.9 });
      totalW += h.inputKw * 1000;
      totalA += i;
    }
  });
  return { rows, totalKw: totalW / 1000, totalA };
}

export type CableRow = {
  tag: string;
  type: string;
  csa: number;
  cores: number;
  material: string;
  lengthM: number;
  ampacity: number;
  vdropPct: number;
};

export function buildCableSchedule(nodes: ResolvedNode[], edges: DesignEdge[]): CableRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const rows: CableRow[] = [];
  for (const n of nodes) {
    if (n.spec.domain !== 'cable') continue;
    const c = n.spec as CableSpec;
    const lengthM = Number((n.params as DesignNode['params']).lengthM ?? 20);
    // Estimate carried current from an adjacent load/hvac, else 0.
    let current = 0;
    let voltage = c.voltageRating || 400;
    let phases: 1 | 3 = 1;
    let pf = 0.9;
    for (const nb of adj.get(n.id) ?? []) {
      const node = byId.get(nb);
      if (node?.spec.domain === 'load') {
        const l = node.spec as LoadSpec;
        current = loadCurrent(l.powerW, l.voltage, l.phases, l.powerFactor);
        voltage = l.voltage; phases = l.phases; pf = l.powerFactor;
      } else if (node?.spec.domain === 'hvac') {
        const h = node.spec as HvacSpec;
        current = loadCurrent(h.inputKw * 1000, h.voltage, h.phases, 0.9);
        voltage = h.voltage; phases = h.phases; pf = 0.9;
      }
    }
    const vdrop = current > 0 ? voltageDropPercent(c, current, lengthM, voltage, phases, pf) : 0;
    rows.push({
      tag: n.id.slice(-4).toUpperCase(),
      type: c.category,
      csa: c.csaMm2,
      cores: c.coreCount,
      material: c.conductorMaterial,
      lengthM,
      ampacity: c.ampacityA,
      vdropPct: vdrop,
    });
  }
  return rows;
}

export function declarationText(node: ResolvedNode): string {
  return declarationFor(node.spec)?.text ?? '-';
}
