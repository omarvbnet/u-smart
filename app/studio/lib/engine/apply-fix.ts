/**
 * Apply validation auto-fixes to design state (single or batched).
 */
import { CATALOG, getCatalogEntry, type CatalogEntry, type SmartHomeSpec } from '../catalog';
import type { DesignNode, DesignEdge, DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { defaultControlState, type ControlState } from '../controls';
import { findMainPanel, psuCatalogIdsForProject, suggestSmartFixes, loadReachablePanel } from './autofix';
import {
  rerouteCableNode,
  cableIdsLinkedToNode,
  computeCableRoute,
  applyRouteToCable,
  conduitTypeForCable,
} from './cable-map';
import { resolveNodes } from '../model';
import { CABLES } from '../catalog/cables';
import type { CableSpec, LoadSpec, HvacSpec } from '../catalog';
import { loadCurrent, selectBreakerRating } from './electrical';
import { cableCatalogIdForCurrent, mcbCatalogIdForCurrent } from './iraq-electrical';
import type { Fix, Issue } from './validation';
import { validateDesign } from './validation';
import { validatePlacement } from './placement-validation';
import { validateLightingDesign } from './lighting-validation';

export type FixableState = {
  locale: StudioLocale;
  project: ProjectInfo;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  rooms: DesignRoom[];
  activeFloorId?: string;
};

export type FixPatch = Partial<Pick<FixableState, 'nodes' | 'edges' | 'controls'>>;

function pickBreaker(rating: number): CatalogEntry | undefined {
  const protections = CATALOG.filter((e) => e.domain === 'protection') as Extract<CatalogEntry, { domain: 'protection' }>[];
  return protections
    .filter((p) => p.protectionType === 'MCB' || p.protectionType === 'MCCB')
    .sort((a, b) => a.ratedCurrentA - b.ratedCurrentA)
    .find((p) => p.ratedCurrentA >= rating);
}

function defaultLabel(entry: CatalogEntry, locale: StudioLocale): string {
  return entry.name[locale] ?? entry.name.en;
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

function gatewayForProtocol(nodes: DesignNode[], protocol: string): DesignNode | undefined {
  return nodes.find((n) => n.id === `gw_${protocol}`);
}

function lightingNodesInRoom(nodes: DesignNode[], room: DesignRoom): DesignNode[] {
  return nodes.filter((n) => {
    const e = getCatalogEntry(n.catalogId);
    if (e?.domain !== 'load' || e.category !== 'LIGHTING') return false;
    if (n.params.roomId === room.id) return true;
    const cx = n.x + 21;
    const cy = n.y + 21;
    return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
  });
}

function placeRoomLightingNodes(room: DesignRoom, catalogId: string, count: number, existing: DesignNode[]): DesignNode[] {
  const placed = lightingNodesInRoom(existing, room).length;
  const need = Math.max(0, count - placed);
  if (need <= 0) return [];

  const nodes: DesignNode[] = [];
  const cols = Math.ceil(Math.sqrt(need));
  const rows = Math.ceil(need / cols);
  const padX = room.width * 0.15;
  const padY = room.height * 0.15;
  const cellW = (room.width - padX * 2) / Math.max(1, cols);
  const cellH = (room.height - padY * 2) / Math.max(1, rows);

  for (let i = 0; i < need; i++) {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    nodes.push({
      id: uid(`light_${room.id}`),
      catalogId,
      label: `${room.label} light ${placed + i + 1}`,
      x: room.x + padX + col * cellW + cellW / 2 - 21,
      y: room.y + padY + rowIdx * cellH + cellH / 2 - 21,
      floorId: room.floorId,
      params: { roomId: room.id, showOnMap: true },
    });
  }
  return nodes;
}

function loadDesignCurrentA(node: DesignNode): number {
  const entry = getCatalogEntry(node.catalogId);
  if (!entry) return 16;
  if (entry.domain === 'load') {
    const l = entry as LoadSpec;
    const powerW = Number(node.params.powerW) || l.powerW;
    return loadCurrent(powerW, l.voltage, l.phases, l.powerFactor);
  }
  if (entry.domain === 'hvac') {
    const h = entry as HvacSpec;
    return loadCurrent(h.inputKw * 1000, h.voltage, h.phases, 0.9);
  }
  return 16;
}

function mcbCatalogForCurrent(designA: number, cableAmpacity = 999): { id: string; entry: CatalogEntry } | null {
  const catalogId = mcbCatalogIdForCurrent(designA, cableAmpacity);
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    const rating = selectBreakerRating(designA, cableAmpacity) ?? Math.min(250, Math.max(6, Math.ceil(designA)));
    const fallback = pickBreaker(rating);
    if (!fallback) return null;
    return { id: fallback.id, entry: fallback };
  }
  return { id: catalogId, entry };
}

function backboneAnchor(s: FixableState): { x: number; y: number } {
  const panel = findMainPanel(s.nodes);
  if (panel) return { x: panel.x, y: panel.y };
  const loads = s.nodes.filter((n) => {
    const e = getCatalogEntry(n.catalogId);
    return e?.domain === 'load' && (e as LoadSpec).category !== 'PANEL';
  });
  if (loads.length) {
    const ax = loads.reduce((sum, n) => sum + n.x, 0) / loads.length;
    const ay = loads.reduce((sum, n) => sum + n.y, 0) / loads.length;
    return { x: ax - 200, y: ay };
  }
  const room = s.rooms[0];
  if (room) return { x: room.x - 80, y: room.y + 40 };
  return { x: 80, y: 120 };
}

/** Create utility source + main DB and link them when missing (manual / partial designs). */
export function ensureMainPanelAndSource(
  s: FixableState,
  sourceCatalogId = 'src-utility-400',
): FixPatch {
  const nodes = [...s.nodes];
  const edges = [...s.edges];
  const controls = { ...s.controls };
  let changed = false;

  let panel = findMainPanel(nodes);
  let source = nodes.find((n) => getCatalogEntry(n.catalogId)?.domain === 'source');
  const anchor = backboneAnchor(s);

  if (!panel) {
    const panelEntry = getCatalogEntry('load-distribution-board');
    if (!panelEntry) return {};
    panel = {
      id: nodes.some((n) => n.id === 'panel_main') ? uid('panel') : 'panel_main',
      catalogId: 'load-distribution-board',
      label: defaultLabel(panelEntry, s.locale),
      x: anchor.x,
      y: anchor.y,
      floorId: s.activeFloorId,
      params: { showOnMap: true },
    };
    nodes.push(panel);
    controls[panel.id] = defaultControlState(panelEntry);
    changed = true;
  }

  if (!source) {
    const srcEntry = getCatalogEntry(sourceCatalogId);
    if (!srcEntry) return changed ? { nodes, edges, controls } : {};
    source = {
      id: uid('src'),
      catalogId: sourceCatalogId,
      label: defaultLabel(srcEntry, s.locale),
      x: panel!.x - 160,
      y: panel!.y,
      floorId: s.activeFloorId,
      params: { showOnMap: true },
    };
    nodes.push(source);
    controls[source.id] = defaultControlState(srcEntry);
    changed = true;
  }

  const linked = edges.some(
    (e) =>
      (e.source === source!.id && e.target === panel!.id) ||
      (e.target === source!.id && e.source === panel!.id),
  );
  if (!linked) {
    edges.push({
      id: uid('e'),
      source: source!.id,
      sourceHandle: 'out',
      target: panel!.id,
      targetHandle: 'in',
    });
    changed = true;
  }

  return changed ? { nodes, edges, controls } : {};
}

/** Re-route cables and sync lengthM / routePoints used by validation. */
export function finalizeFixableState(s: FixableState, affectedCableIds?: Set<string>): FixableState {
  if (!affectedCableIds?.size) return s;
  const nodes = s.nodes.map((n) => {
    if (getCatalogEntry(n.catalogId)?.domain !== 'cable') return n;
    if (!affectedCableIds.has(n.id)) return n;
    return rerouteCableNode(n, s.nodes, s.edges, s.rooms);
  });
  return { ...s, nodes };
}

export function fixesFromIssues(issues: Issue[]): Fix[] {
  return prioritizeFixes(issues.filter((i) => i.fix).map((i) => i.fix!));
}

export function collectFixableFixes(s: FixableState): Fix[] {
  const activeFloorId = s.activeFloorId ?? 'floor_0';
  const matchesFloor = <T extends { floorId?: string }>(item: T) =>
    !item.floorId || item.floorId === activeFloorId;
  const resolved = resolveNodes(s.nodes, getCatalogEntry);
  const activeRooms = s.rooms.filter(matchesFloor);
  const activeResolved = resolved.filter(matchesFloor);
  const floorNodes = s.nodes.filter(matchesFloor);
  const { issues: engIssues } = validateDesign(activeResolved, s.edges, CABLES as CableSpec[]);
  const placeIssues = validatePlacement(floorNodes, activeRooms, getCatalogEntry);
  const lightingIssues = validateLightingDesign(activeResolved, activeRooms);
  const smartIssues = suggestSmartFixes(s.project, s.nodes, s.edges, activeRooms);
  return fixesFromIssues([...engIssues, ...placeIssues, ...lightingIssues, ...smartIssues]);
}

export function affectedCableIdsForFix(
  fix: Fix,
  patch: FixPatch,
  state: FixableState,
): Set<string> {
  const ids = new Set<string>();
  if (fix.kind === 'resizeCable') ids.add(fix.nodeId);
  if (fix.kind === 'addCircuit') {
    for (const n of patch.nodes ?? []) {
      if (getCatalogEntry(n.catalogId)?.domain === 'cable') ids.add(n.id);
    }
  }
  if (fix.kind === 'moveNode') {
    for (const id of cableIdsLinkedToNode(fix.nodeId, state.nodes, state.edges)) ids.add(id);
  }
  return ids;
}

export function applyFixesUntilStable(
  initial: FixableState,
  seedFixes?: Fix[],
  maxRounds = 2,
): { state: FixableState; applied: number } {
  let state = initial;
  let totalApplied = 0;

  for (let round = 0; round < maxRounds; round++) {
    const fixes = round === 0 && seedFixes?.length ? prioritizeFixes(seedFixes) : collectFixableFixes(state);
    if (!fixes.length) break;

    let roundApplied = 0;
    let affectedCables = new Set<string>();

    for (const fix of fixes) {
      const patch = applyFixPatch(state, fix);
      if (!patch) continue;
      state = mergeFixableState(state, patch);
      for (const id of affectedCableIdsForFix(fix, patch, state)) affectedCables.add(id);
      roundApplied++;
    }

    if (!roundApplied) break;

    state = finalizeFixableState(state, affectedCables);
    totalApplied += roundApplied;
  }

  return { state, applied: totalApplied };
}

export const FIX_APPLY_BATCH = 12;
export const FIX_MAX_ROUNDS = 3;

/** Apply one chunk of fixes — used by the async fix-all scheduler. */
export function applyFixChunk(
  state: FixableState,
  fixes: Fix[],
): { state: FixableState; applied: number; affectedCables: Set<string> } {
  let next = state;
  let applied = 0;
  const affectedCables = new Set<string>();
  for (const fix of fixes) {
    const patch = applyFixPatch(next, fix, { deferCableRoute: true });
    if (!patch) continue;
    next = mergeFixableState(next, patch);
    for (const id of affectedCableIdsForFix(fix, patch, next)) affectedCables.add(id);
    applied++;
  }
  return { state: next, applied, affectedCables };
}

export function applyFixPatch(
  s: FixableState,
  fix: Fix,
  opts?: { deferCableRoute?: boolean },
): FixPatch | null {
  if (fix.kind === 'addRoomLighting') {
    const room = s.rooms.find((r) => r.id === fix.roomId);
    const entry = getCatalogEntry(fix.catalogId);
    if (!room || !entry) return null;
    const added = placeRoomLightingNodes(room, fix.catalogId, fix.count, s.nodes);
    if (!added.length) return null;
    const controls = { ...s.controls };
    for (const n of added) controls[n.id] = defaultControlState(entry);
    return { nodes: [...s.nodes, ...added], controls };
  }
  if (fix.kind === 'resizeCable') {
    const entry = getCatalogEntry(fix.toCatalogId);
    const cableNode = s.nodes.find((n) => n.id === fix.nodeId);
    if (!entry || !cableNode) return null;
    const updated: DesignNode = {
      ...cableNode,
      catalogId: fix.toCatalogId,
      label: defaultLabel(entry, s.locale),
    };
    if (opts?.deferCableRoute) {
      return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? updated : n)) };
    }
    const points = computeCableRoute(updated, s.nodes, s.edges, s.rooms);
    const params = applyRouteToCable(updated, points, entry as CableSpec);
    return {
      nodes: s.nodes.map((n) =>
        n.id === fix.nodeId ? { ...updated, label: String(params.cableLabel ?? updated.label), params } : n,
      ),
    };
  }
  if (fix.kind === 'replaceBreaker') {
    const replacement = pickBreaker(fix.toRating);
    if (!replacement) return null;
    return {
      nodes: s.nodes.map((n) =>
        n.id === fix.nodeId ? { ...n, catalogId: replacement.id, label: defaultLabel(replacement, s.locale) } : n,
      ),
    };
  }
  if (fix.kind === 'setParam') {
    const node = s.nodes.find((n) => n.id === fix.nodeId);
    if (!node) return null;
    return {
      nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, params: { ...n.params, [fix.key]: fix.value } } : n)),
    };
  }
  if (fix.kind === 'addGrounding') {
    if (s.nodes.some((n) => n.catalogId === 'spd-t2')) return null;
    const spd = CATALOG.find((e) => e.domain === 'protection' && e.id === 'spd-t2');
    if (!spd) return null;
    const anchor = s.nodes.find((n) => getCatalogEntry(n.catalogId)?.domain === 'source');
    const node: DesignNode = {
      id: uid('n'),
      catalogId: spd.id,
      label: defaultLabel(spd, s.locale),
      x: anchor ? anchor.x + 40 : 120,
      y: anchor ? anchor.y + 140 : 120,
      params: {},
    };
    return { nodes: [...s.nodes, node], controls: { ...s.controls, [node.id]: defaultControlState(spd) } };
  }
  if (fix.kind === 'moveNode') {
    if (!s.nodes.some((n) => n.id === fix.nodeId)) return null;
    return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, x: fix.x, y: fix.y } : n)) };
  }
  if (fix.kind === 'replaceCatalog') {
    const replacement = getCatalogEntry(fix.toCatalogId);
    if (!replacement || !s.nodes.some((n) => n.id === fix.nodeId)) return null;
    return {
      nodes: s.nodes.map((n) =>
        n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(replacement, s.locale) } : n,
      ),
      controls: { ...s.controls, [fix.nodeId]: defaultControlState(replacement) },
    };
  }
  if (fix.kind === 'addPsu') {
    const ids = psuCatalogIdsForProject(s.project);
    const added: DesignNode[] = [];
    const edges = [...s.edges];
    const controls = { ...s.controls };
    const anchor = s.nodes.find((n) => getCatalogEntry(n.catalogId)?.domain === 'smarthome') ?? s.nodes[0];
    let placed = 0;
    while (placed < fix.count) {
      const catId = ids[placed % ids.length]!;
      const entry = getCatalogEntry(catId);
      if (!entry) break;
      const node: DesignNode = {
        id: uid('n'),
        catalogId: catId,
        label: defaultLabel(entry, s.locale),
        x: (anchor?.x ?? 0) + 50 + placed * 40,
        y: (anchor?.y ?? 0) + 80 + placed * 48,
        params: { showOnMap: true },
      };
      added.push(node);
      controls[node.id] = defaultControlState(entry);
      const proto = (entry as SmartHomeSpec).protocol;
      const gw = gatewayForProtocol([...s.nodes, ...added], proto);
      if (gw) {
        edges.push({
          id: uid('e'),
          source: gw.id,
          sourceHandle: 'bus',
          target: node.id,
          targetHandle: 'bus',
        });
      }
      placed++;
    }
    if (!added.length) return null;
    return { nodes: [...s.nodes, ...added], edges, controls };
  }
  if (fix.kind === 'ensureBackbone') {
    const patch = ensureMainPanelAndSource(s, fix.sourceCatalogId ?? 'src-utility-400');
    return patch.nodes?.length || patch.edges?.length ? patch : null;
  }
  if (fix.kind === 'addCircuit') {
    const infra = ensureMainPanelAndSource(s);
    const working = infra.nodes?.length || infra.edges?.length ? mergeFixableState(s, infra) : s;
    const load = working.nodes.find((n) => n.id === fix.loadNodeId);
    const panel = findMainPanel(working.nodes) ?? working.nodes.find((n) => n.id === fix.panelNodeId);
    if (!load || !panel) return infra.nodes?.length || infra.edges?.length ? infra : null;
    if (loadReachablePanel(load.id, working.nodes, working.edges)) {
      return infra.nodes?.length || infra.edges?.length ? infra : null;
    }

    const designA = loadDesignCurrentA(load);
    const cableCatalogId = cableCatalogIdForCurrent(designA);
    const cableEntry = getCatalogEntry(cableCatalogId) as CableSpec | undefined;
    const mcbPick = mcbCatalogForCurrent(designA, cableEntry?.ampacityA ?? 999);
    if (!mcbPick || !cableEntry) return infra.nodes?.length || infra.edges?.length ? infra : null;

    const mcbId = uid('n');
    const cableId = uid('n');
    const mcbX = load.x - 48;
    const mcbY = load.y;
    const mcb: DesignNode = {
      id: mcbId,
      catalogId: mcbPick.id,
      label: defaultLabel(mcbPick.entry, working.locale),
      x: mcbX,
      y: mcbY,
      floorId: load.floorId ?? panel.floorId ?? working.activeFloorId,
      params: { designA: Math.round(designA * 10) / 10, showOnMap: true },
    };
    const cable: DesignNode = {
      id: cableId,
      catalogId: cableEntry.id,
      label: defaultLabel(cableEntry, working.locale),
      x: mcbX,
      y: mcbY + 24,
      floorId: load.floorId ?? panel.floorId ?? working.activeFloorId,
      params: { showOnMap: true },
    };
    const draftNodes = [...working.nodes, mcb, cable];
    const draftEdges: DesignEdge[] = [
      ...working.edges,
      { id: uid('e'), source: panel.id, sourceHandle: 'out', target: mcbId, targetHandle: 'line' },
      { id: uid('e'), source: mcbId, sourceHandle: 'load', target: cableId, targetHandle: 'a' },
      { id: uid('e'), source: cableId, sourceHandle: 'b', target: load.id, targetHandle: 'in' },
    ];
    if (opts?.deferCableRoute) {
      const routedCable: DesignNode = {
        ...cable,
        params: { showOnMap: true, lengthM: 0, conduitType: conduitTypeForCable(cableEntry) },
      };
      return {
        nodes: [...working.nodes, mcb, routedCable],
        edges: draftEdges,
        controls: { ...working.controls, [mcbId]: defaultControlState(mcbPick.entry) },
      };
    }
    const points = computeCableRoute(cable, draftNodes, draftEdges, working.rooms);
    const cableParams = applyRouteToCable(cable, points, cableEntry);
    const routedCable: DesignNode = {
      ...cable,
      label: String(cableParams.cableLabel ?? cable.label),
      params: cableParams,
    };
    return {
      nodes: [...working.nodes, mcb, routedCable],
      edges: draftEdges,
      controls: { ...working.controls, [mcbId]: defaultControlState(mcbPick.entry) },
    };
  }
  if (fix.kind === 'addSource') {
    const patch = ensureMainPanelAndSource(s, fix.catalogId);
    return patch.nodes?.length || patch.edges?.length ? patch : null;
  }
  if (fix.kind === 'upgradeBreaker') {
    const replacement = getCatalogEntry(fix.toCatalogId);
    if (!replacement || !s.nodes.some((n) => n.id === fix.nodeId)) return null;
    return {
      nodes: s.nodes.map((n) =>
        n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(replacement, s.locale) } : n,
      ),
      controls: { ...s.controls, [fix.nodeId]: defaultControlState(replacement) },
    };
  }
  return null;
}

export function mergeFixableState(s: FixableState, patch: FixPatch): FixableState {
  return {
    ...s,
    nodes: patch.nodes ?? s.nodes,
    edges: patch.edges ?? s.edges,
    controls: patch.controls ?? s.controls,
  };
}

/** Apply one fix with cable finalize — re-validate after each call in fix-all loops. */
export function applyFixStep(state: FixableState, fix: Fix): { state: FixableState; applied: boolean } {
  const patch = applyFixPatch(state, fix);
  if (!patch) return { state, applied: false };
  let merged = mergeFixableState(state, patch);
  const affected = affectedCableIdsForFix(fix, patch, merged);
  if (affected.size > 0) merged = finalizeFixableState(merged, affected);
  return { state: merged, applied: true };
}

export function fixKey(f: Fix): string {
  switch (f.kind) {
    case 'setParam':
      return `setParam:${f.nodeId}:${f.key}`;
    case 'moveNode':
      return `moveNode:${f.nodeId}`;
    case 'resizeCable':
      return `resizeCable:${f.nodeId}`;
    case 'replaceBreaker':
      return `replaceBreaker:${f.nodeId}`;
    case 'replaceCatalog':
      return `replaceCatalog:${f.nodeId}`;
    case 'upgradeBreaker':
      return `upgradeBreaker:${f.nodeId}`;
    case 'addCircuit':
      return `addCircuit:${f.loadNodeId}`;
    case 'ensureBackbone':
      return 'ensureBackbone';
    case 'addRoomLighting':
      return `addRoomLighting:${f.roomId}`;
    case 'addGrounding':
      return 'addGrounding';
    case 'addSource':
      return `addSource:${f.catalogId}`;
    case 'addPsu':
      return 'addPsu';
    default:
      return JSON.stringify(f);
  }
}

/** Drop duplicate fixes; merge Bus PSU adds; one source/grounding per batch. */
export function dedupeFixes(fixes: Fix[]): Fix[] {
  const psuCount = fixes
    .filter((f): f is Extract<Fix, { kind: 'addPsu' }> => f.kind === 'addPsu')
    .reduce((sum, f) => sum + f.count, 0);
  const seen = new Set<string>();
  const out: Fix[] = [];
  let psuAdded = false;
  let groundingAdded = false;
  let backboneAdded = false;
  const sourcesAdded = new Set<string>();

  for (const f of fixes) {
    if (f.kind === 'addPsu') {
      if (!psuAdded && psuCount > 0) {
        out.push({ kind: 'addPsu', count: psuCount });
        psuAdded = true;
      }
      continue;
    }
    if (f.kind === 'addGrounding') {
      if (groundingAdded) continue;
      groundingAdded = true;
    }
    if (f.kind === 'ensureBackbone') {
      if (backboneAdded) continue;
      backboneAdded = true;
    }
    if (f.kind === 'addSource') {
      if (sourcesAdded.has(f.catalogId)) continue;
      sourcesAdded.add(f.catalogId);
    }
    const key = fixKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

const FIX_ORDER: Record<Fix['kind'], number> = {
  ensureBackbone: 0,
  addSource: 0,
  addGrounding: 1,
  addPsu: 2,
  addRoomLighting: 3,
  replaceCatalog: 4,
  upgradeBreaker: 4,
  replaceBreaker: 4,
  resizeCable: 5,
  setParam: 5,
  moveNode: 6,
  addCircuit: 7,
};

export function prioritizeFixes(fixes: Fix[], maxCircuits = 2000): Fix[] {
  const sorted = dedupeFixes(fixes).sort((a, b) => (FIX_ORDER[a.kind] ?? 9) - (FIX_ORDER[b.kind] ?? 9));
  let circuits = 0;
  return sorted.filter((f) => {
    if (f.kind !== 'addCircuit') return true;
    if (circuits >= maxCircuits) return false;
    circuits += 1;
    return true;
  });
}

export function applyAllFixPatches(s: FixableState, fixes: Fix[]): { state: FixableState; applied: number } {
  return applyFixesUntilStable(s, fixes, 1);
}
