/**
 * U Smart Studio — engineering report builders (BOQ, load/cable/panel schedules).
 * Pure functions over the resolved design.
 */
import type { CableSpec, ProtectionSpec, LoadSpec, HvacSpec, SourceSpec, SmartHomeSpec } from '../catalog';
import type { ResolvedNode, DesignEdge, DesignNode, DesignRoom, DesignFloor } from '../model';
import { loadCurrent, voltageDropPercent } from './electrical';
import { declarationFor } from './declarations';

export function roomForNode(n: DesignNode, rooms: DesignRoom[]): DesignRoom | undefined {
  const roomId = n.params.roomId;
  if (typeof roomId === 'string') {
    const byId = rooms.find((r) => r.id === roomId);
    if (byId) return byId;
  }
  const cx = n.x + 21;
  const cy = n.y + 21;
  return rooms.find((r) => {
    if (n.floorId && r.floorId && r.floorId !== n.floorId) return false;
    return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
  });
}

function floorLabel(floorId: string | undefined, floors: DesignFloor[]): string {
  if (!floorId) return '—';
  return floors.find((f) => f.id === floorId)?.label ?? floorId;
}

export type DeviceRegisterRow = {
  nodeId: string;
  label: string;
  floor: string;
  room: string;
  domain: string;
  category: string;
  manufacturer: string;
  model: string;
  mapX: number;
  mapY: number;
  voltage: string;
  current: string;
  declaration: string;
  cableLabel: string;
  conduitType: string;
  lengthM: string;
  showOnMap: string;
  notes: string;
};

export function buildDeviceRegister(
  nodes: ResolvedNode[],
  rooms: DesignRoom[],
  floors: DesignFloor[],
): DeviceRegisterRow[] {
  return nodes
    .map((n) => {
      const room = roomForNode(n, rooms);
      const decl = declarationFor(n.spec, n.params);
      const notes: string[] = [];
      if (n.spec.domain === 'source' && n.params.ratedKva != null) {
        notes.push(`${n.params.ratedKva} kW rated`);
      }
      if (n.spec.domain === 'smarthome') {
        const sh = n.spec as SmartHomeSpec;
        if (sh.channels > 0) notes.push(`${sh.channels} ch`);
        if (typeof n.params.channelAssignments === 'string') notes.push('mapped channels');
      }
      if (n.params.vrfRole) notes.push(String(n.params.vrfRole));
      if (n.params.hvacRole) notes.push(String(n.params.hvacRole));
      return {
        nodeId: n.id,
        label: n.label,
        floor: floorLabel(n.floorId ?? room?.floorId, floors),
        room: room?.label ?? String(n.params.roomLabel ?? '—'),
        domain: n.spec.domain,
        category: 'category' in n.spec ? String(n.spec.category) : '—',
        manufacturer: n.spec.manufacturer,
        model: n.spec.model,
        mapX: Math.round(n.x),
        mapY: Math.round(n.y),
        voltage: decl ? `${decl.voltage} V` : '—',
        current: decl && decl.current > 0 ? `${decl.current.toFixed(2)} A` : '—',
        declaration: decl?.text ?? '—',
        cableLabel: String(n.params.cableLabel ?? '—'),
        conduitType: String(n.params.conduitType ?? '—'),
        lengthM: n.spec.domain === 'cable' ? String(n.params.lengthM ?? '—') : '—',
        showOnMap: n.params.showOnMap === false ? 'No' : 'Yes',
        notes: notes.join('; ') || '—',
      };
    })
    .sort((a, b) => a.floor.localeCompare(b.floor) || a.room.localeCompare(b.room) || a.label.localeCompare(b.label));
}

export type RoomRegisterRow = {
  floor: string;
  room: string;
  zone: string;
  areaM2: number;
  mapX: number;
  mapY: number;
  width: number;
  height: number;
  devices: number;
  outlets: number;
  cables: number;
};

export function buildRoomRegister(
  nodes: ResolvedNode[],
  rooms: DesignRoom[],
  floors: DesignFloor[],
): RoomRegisterRow[] {
  return rooms.map((r) => {
    const onFloor = nodes.filter((n) => {
      if (n.floorId && r.floorId && n.floorId !== r.floorId) return false;
      const room = roomForNode(n, [r]);
      return room?.id === r.id || n.params.roomId === r.id;
    });
    const areaM2 = Number(((r.width / 50) * (r.height / 50)).toFixed(1));
    return {
      floor: floorLabel(r.floorId, floors),
      room: r.label,
      zone: r.zone,
      areaM2,
      mapX: Math.round(r.x),
      mapY: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      devices: onFloor.length,
      outlets: onFloor.filter((n) => n.spec.domain === 'load' && (n.spec.category === 'SOCKET' || n.spec.category === 'APPLIANCE')).length,
      cables: onFloor.filter((n) => n.spec.domain === 'cable').length,
    };
  });
}

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
    const unitCost = isCable ? (s as CableSpec).costPerMeter : estimateCost(s, n.params);
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
function estimateCost(s: ResolvedNode['spec'], params?: DesignNode['params']): number {
  switch (s.domain) {
    case 'protection': {
      const p = s as ProtectionSpec;
      const base = { MCB: 12, RCBO: 45, RCCB: 60, MCCB: 180, ACB: 1800, MPCB: 55, FUSE: 8, SPD: 120 }[p.protectionType] ?? 20;
      return base + p.ratedCurrentA * 0.4;
    }
    case 'source': {
      const src = s as SourceSpec;
      return (Number(params?.ratedKva) || src.ratedKva) * 120;
    }
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
  nodeId: string;
  label: string;
  floor: string;
  room: string;
  name: string;
  powerW: number;
  voltage: number;
  phases: number;
  current: number;
  pf: number;
};

export function buildLoadSchedule(
  nodes: ResolvedNode[],
  rooms: DesignRoom[] = [],
  floors: DesignFloor[] = [],
): { rows: LoadRow[]; totalKw: number; totalA: number } {
  const rows: LoadRow[] = [];
  let totalW = 0;
  let totalA = 0;
  nodes.forEach((n) => {
    const room = roomForNode(n, rooms);
    const fl = floorLabel(n.floorId ?? room?.floorId, floors);
    const rm = room?.label ?? '—';
    if (n.spec.domain === 'load') {
      const l = n.spec as LoadSpec;
      const powerW = Number(n.params.powerW) || l.powerW;
      const i = loadCurrent(powerW, l.voltage, l.phases, l.powerFactor);
      rows.push({
        tag: n.label || n.id.slice(-6).toUpperCase(),
        nodeId: n.id,
        label: n.label,
        floor: fl,
        room: rm,
        name: l.name.en,
        powerW,
        voltage: l.voltage,
        phases: l.phases,
        current: i,
        pf: l.powerFactor,
      });
      totalW += powerW;
      totalA += i;
    } else if (n.spec.domain === 'hvac') {
      const h = n.spec as HvacSpec;
      const i = loadCurrent(h.inputKw * 1000, h.voltage, h.phases, 0.9);
      rows.push({
        tag: n.label || n.id.slice(-6).toUpperCase(),
        nodeId: n.id,
        label: n.label,
        floor: fl,
        room: rm,
        name: h.name.en,
        powerW: h.inputKw * 1000,
        voltage: h.voltage,
        phases: h.phases,
        current: i,
        pf: 0.9,
      });
      totalW += h.inputKw * 1000;
      totalA += i;
    } else if (n.spec.domain === 'source') {
      const src = n.spec as SourceSpec;
      const ratedKva = Number(n.params.ratedKva) || src.ratedKva;
      const i =
        src.phases === 3
          ? (ratedKva * 1000) / (Math.sqrt(3) * src.voltage)
          : (ratedKva * 1000) / src.voltage;
      rows.push({
        tag: n.label || n.id.slice(-6).toUpperCase(),
        nodeId: n.id,
        label: n.label,
        floor: fl,
        room: rm,
        name: src.name.en,
        powerW: ratedKva * 1000,
        voltage: src.voltage,
        phases: src.phases,
        current: i,
        pf: src.powerFactor,
      });
      totalW += ratedKva * 1000;
      totalA += i;
    }
  });
  return { rows, totalKw: totalW / 1000, totalA };
}

export type CableRow = {
  tag: string;
  nodeId: string;
  label: string;
  floor: string;
  room: string;
  cableLabel: string;
  conduitType: string;
  type: string;
  csa: number;
  cores: number;
  material: string;
  lengthM: number;
  ampacity: number;
  vdropPct: number;
  mapX: number;
  mapY: number;
};

export function buildCableSchedule(
  nodes: ResolvedNode[],
  edges: DesignEdge[],
  rooms: DesignRoom[] = [],
  floors: DesignFloor[] = [],
): CableRow[] {
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
    const room = roomForNode(n, rooms);
    rows.push({
      tag: n.label || n.id.slice(-6).toUpperCase(),
      nodeId: n.id,
      label: n.label,
      floor: floorLabel(n.floorId ?? room?.floorId, floors),
      room: room?.label ?? String(n.params.roomLabel ?? '—'),
      cableLabel: String(n.params.cableLabel ?? n.label),
      conduitType: String(n.params.conduitType ?? 'conduit'),
      type: c.category,
      csa: c.csaMm2,
      cores: c.coreCount,
      material: c.conductorMaterial,
      lengthM,
      ampacity: c.ampacityA,
      vdropPct: vdrop,
      mapX: Math.round(n.x),
      mapY: Math.round(n.y),
    });
  }
  return rows;
}

export function declarationText(node: ResolvedNode): string {
  return declarationFor(node.spec, node.params)?.text ?? '-';
}
