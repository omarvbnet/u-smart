/**
 * Extended auto-fix suggestions — placement, HVAC sizing, smart topology.
 */
import { CATALOG, getCatalogEntry, type HvacSpec } from '../catalog';
import type { DesignNode, DesignRoom, DesignEdge } from '../model';
import type { ProjectInfo } from '../project';
import type { Fix, Issue } from './validation';
import { buildSmartTopology } from './smarthome-topology';
import { calculateHvacLoads } from './hvac-loads';
import { footprintPx, physicalSpecFor, PX_PER_M } from '../catalog/dimensions';

const t = (ar: string, en: string, ku: string, tr: string) => ({ ar, en, ku, tr });

function roomAt(rooms: DesignRoom[], x: number, y: number): DesignRoom | null {
  for (const r of rooms) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r;
  }
  return null;
}

function centerOfRoom(room: DesignRoom): { x: number; y: number } {
  return { x: room.x + room.width / 2 - 20, y: room.y + room.height / 2 - 20 };
}

function nearestRoom(rooms: DesignRoom[], x: number, y: number): DesignRoom | null {
  if (!rooms.length) return null;
  let best = rooms[0]!;
  let bestD = Infinity;
  for (const r of rooms) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function suggestPlacementFix(
  nodeId: string,
  nodes: DesignNode[],
  rooms: DesignRoom[],
  code: string,
): Fix | undefined {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || !rooms.length) return undefined;
  const entry = getCatalogEntry(node.catalogId);
  if (!entry) return undefined;
  const fp = footprintPx(physicalSpecFor(entry));

  if (code === 'PLACE_OUTSIDE_ROOM') {
    const target = nearestRoom(rooms, node.x + fp.w / 2, node.y + fp.h / 2);
    if (!target) return undefined;
    const pos = centerOfRoom(target);
    return { kind: 'moveNode', nodeId, x: pos.x, y: pos.y };
  }

  if (code === 'PLACE_NO_FIT') {
    const cx = node.x + fp.w / 2;
    const cy = node.y + fp.h / 2;
    const room = roomAt(rooms, cx, cy) ?? nearestRoom(rooms, cx, cy);
    if (!room) return undefined;
    const reqW = ((physicalSpecFor(entry).widthMm + physicalSpecFor(entry).clearanceFrontMm) / 1000) * PX_PER_M;
    const reqH = ((physicalSpecFor(entry).heightMm + physicalSpecFor(entry).clearanceSideMm * 2) / 1000) * PX_PER_M;
    if (reqW <= room.width && reqH <= room.height) {
      const pos = centerOfRoom(room);
      return { kind: 'moveNode', nodeId, x: pos.x, y: pos.y };
    }
    const larger = [...rooms].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!larger || larger.id === room.id) return undefined;
    const pos = centerOfRoom(larger);
    return { kind: 'moveNode', nodeId, x: pos.x, y: pos.y };
  }

  if (code === 'PLACE_CLEARANCE') {
    return { kind: 'moveNode', nodeId, x: node.x + 60, y: node.y + 40 };
  }

  return undefined;
}

export function suggestHvacFix(nodeId: string, nodes: DesignNode[]): Fix | undefined {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;
  const entry = getCatalogEntry(node.catalogId);
  if (!entry || entry.domain !== 'hvac') return undefined;
  const h = entry as HvacSpec;
  if (h.eer >= 3.5) return undefined;

  const better = CATALOG.filter(
    (e): e is HvacSpec => e.domain === 'hvac' && e.hvacType === h.hvacType && e.eer >= 3.5,
  ).sort((a, b) => a.inputKw - b.inputKw)[0];
  if (!better) return undefined;
  return { kind: 'replaceCatalog', nodeId, toCatalogId: better.id };
}

export function psuCatalogId(project: ProjectInfo): string {
  return project.smartProtocol === 'HDL' ? 'hdl-gateway' : 'knx-gateway';
}

export function suggestSmartFixes(
  project: ProjectInfo,
  nodes: DesignNode[],
  edges: import('../model').DesignEdge[],
  rooms: DesignRoom[],
): Issue[] {
  if (!project.smartBuilding) return [];
  const topo = buildSmartTopology(project, nodes, edges, rooms);
  const issues: Issue[] = [];

  if (topo.totalBusMa > topo.psuRequired * 512) {
    issues.push({
      id: 'smart-bus-overload',
      severity: 'critical',
      code: 'SMART_BUS_OVERLOAD',
      title: t('حمل الباص زائد', 'Bus load exceeded', 'بارگرانی باز', 'Veri yolu aşırı yüklü'),
      detail: t(
        `التيار ${topo.totalBusMa} mA يتجاوز ${topo.psuRequired * 512} mA.`,
        `Bus current ${topo.totalBusMa} mA exceeds ${topo.psuRequired * 512} mA.`,
        `کارەبا ${topo.totalBusMa} mA لە ${topo.psuRequired * 512} mA تێدەپەڕێت.`,
        `Veri yolu akımı ${topo.totalBusMa} mA, ${topo.psuRequired * 512} mA aşıyor.`,
      ),
      values: [{ label: t('Bus mA', 'Bus mA', 'Bus mA', 'Bus mA'), value: `${topo.totalBusMa} mA` }],
      standards: ['IEC 60364'],
      recommendation: t('أضف مزود طاقة للباص.', 'Add an additional bus PSU.', 'PSU زیاد بکە.', 'Ek veri yolu PSU ekleyin.'),
      fix: { kind: 'addPsu', count: Math.ceil(topo.totalBusMa / 512) - topo.psuRequired + 1 },
    });
  }

  const hvac = calculateHvacLoads(rooms, project.buildingType);
  for (const n of nodes) {
    const entry = getCatalogEntry(n.catalogId);
    if (!entry || entry.domain !== 'hvac') continue;
    const h = entry as HvacSpec;
    if (h.coolingKw > 0 && h.coolingKw < hvac.totalCoolingKw / Math.max(1, nodes.filter((x) => getCatalogEntry(x.catalogId)?.domain === 'hvac').length)) {
      issues.push({
        id: `${n.id}-hvac-undersized`,
        severity: 'warning',
        code: 'HVAC_UNDERSIZED',
        nodeId: n.id,
        title: t('HVAC أقل من اللازم', 'HVAC undersized', 'HVAC بچووک', 'HVAC yetersiz'),
        detail: t(
          `قدرة الوحدة ${h.coolingKw} kW أقل من الحمل ${hvac.totalCoolingKw.toFixed(1)} kW.`,
          `Unit ${h.coolingKw} kW is below load ${hvac.totalCoolingKw.toFixed(1)} kW.`,
          `یەکە ${h.coolingKw} kW کەمترە.`,
          `Ünite ${h.coolingKw} kW, yük ${hvac.totalCoolingKw.toFixed(1)} kW altında.`,
        ),
        values: [],
        standards: ['ASHRAE'],
        recommendation: t('استبدل بوحدة VRF/VRV أكبر.', 'Replace with a larger VRF unit.', 'VRF گەورەتر.', 'Daha büyük VRF seçin.'),
        fix: suggestHvacUpsize(n.id, hvac.totalCoolingKw),
      });
    }
  }

  return issues;
}

function suggestHvacUpsize(nodeId: string, totalKw: number): Fix | undefined {
  const candidates = CATALOG.filter((e): e is HvacSpec => e.domain === 'hvac' && e.coolingKw >= totalKw * 0.9).sort(
    (a, b) => a.coolingKw - b.coolingKw,
  );
  const pick = candidates[0];
  if (!pick) return undefined;
  return { kind: 'replaceCatalog', nodeId, toCatalogId: pick.id };
}

export function findMainPanel(nodes: DesignNode[]): DesignNode | undefined {
  return (
    nodes.find((n) => n.catalogId === 'load-distribution-board') ??
    nodes.find((n) => {
      const e = getCatalogEntry(n.catalogId);
      return e?.domain === 'load' && (e as import('../catalog').LoadSpec).category === 'PANEL';
    })
  );
}

export function suggestConnectToSource(loadNodeId: string, nodes: DesignNode[]): Fix | undefined {
  const panel = findMainPanel(nodes);
  if (!panel) {
    return { kind: 'addSource', catalogId: 'src-utility-400' };
  }
  return { kind: 'addCircuit', loadNodeId, panelNodeId: panel.id };
}

export function suggestProtectionFix(loadNodeId: string, nodes: DesignNode[]): Fix | undefined {
  const panel = findMainPanel(nodes);
  if (!panel) return suggestConnectToSource(loadNodeId, nodes);
  return { kind: 'addCircuit', loadNodeId, panelNodeId: panel.id };
}

export function suggestCoordinationFix(breakerNodeId: string, nodes: DesignNode[], edges: DesignEdge[]): Fix | undefined {
  const br = nodes.find((n) => n.id === breakerNodeId);
  if (!br) return undefined;
  const cable = nodes.find((n) => {
    const e = getCatalogEntry(n.catalogId);
    return e?.domain === 'cable' && edges.some((ed) => (ed.source === br.id && ed.target === n.id) || (ed.target === br.id && ed.source === n.id));
  });
  if (!cable) return undefined;
  const entry = getCatalogEntry(cable.catalogId);
  if (!entry || entry.domain !== 'cable') return undefined;
  const brSpec = getCatalogEntry(br.catalogId);
  if (!brSpec || brSpec.domain !== 'protection') return undefined;
  const bigger = CATALOG.filter(
    (e) => e.domain === 'cable' && (e as import('../catalog').CableSpec).csaMm2 > (entry as import('../catalog').CableSpec).csaMm2,
  ).sort((a, b) => (a as import('../catalog').CableSpec).csaMm2 - (b as import('../catalog').CableSpec).csaMm2)[0];
  if (bigger) return { kind: 'resizeCable', nodeId: cable.id, toCatalogId: bigger.id };
  const rating = (brSpec as import('../catalog').ProtectionSpec).ratedCurrentA;
  const lower = [16, 20, 25, 32, 40, 50, 63].filter((r) => r < rating).pop();
  if (lower) return { kind: 'replaceBreaker', nodeId: breakerNodeId, toRating: lower };
  return undefined;
}

export function suggestShortCircuitFix(nodeId: string): Fix | undefined {
  const candidates = CATALOG.filter(
    (e) => e.domain === 'protection' && (e as import('../catalog').ProtectionSpec).breakingCapacityKA >= 10,
  ).sort(
    (a, b) =>
      (a as import('../catalog').ProtectionSpec).breakingCapacityKA -
      (b as import('../catalog').ProtectionSpec).breakingCapacityKA,
  );
  const pick =
    candidates.find((e) => (e as import('../catalog').ProtectionSpec).breakingCapacityKA >= 15) ??
    candidates[candidates.length - 1];
  if (!pick) return undefined;
  return { kind: 'upgradeBreaker', nodeId, toCatalogId: pick.id };
}

export function suggestPhaseFix(nodeId: string): Fix | undefined {
  const threePole = CATALOG.find(
    (e) => e.domain === 'protection' && (e as import('../catalog').ProtectionSpec).poles >= 3,
  );
  if (!threePole) return undefined;
  return { kind: 'upgradeBreaker', nodeId, toCatalogId: threePole.id };
}

export function suggestPanelOverloadFix(): Fix {
  return { kind: 'addSource', catalogId: 'src-utility-400' };
}
