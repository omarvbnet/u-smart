/**
 * Apply validation auto-fixes to design state (single or batched).
 */
import { CATALOG, getCatalogEntry, type CatalogEntry } from '../catalog';
import type { DesignNode, DesignEdge } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { defaultControlState, type ControlState } from '../controls';
import { findMainPanel, psuCatalogIdsForProject } from './autofix';
import { serializeRoutePoints } from './cable-map';
import type { Fix } from './validation';

export type FixableState = {
  locale: StudioLocale;
  project: ProjectInfo;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
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

export function applyFixPatch(s: FixableState, fix: Fix): FixPatch | null {
  if (fix.kind === 'resizeCable') {
    const entry = getCatalogEntry(fix.toCatalogId);
    if (!entry) return null;
    return {
      nodes: s.nodes.map((n) =>
        n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(entry, s.locale) } : n,
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
    return {
      nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, params: { ...n.params, [fix.key]: fix.value } } : n)),
    };
  }
  if (fix.kind === 'addGrounding') {
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
    return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, x: fix.x, y: fix.y } : n)) };
  }
  if (fix.kind === 'replaceCatalog') {
    const replacement = getCatalogEntry(fix.toCatalogId);
    if (!replacement) return null;
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
        y: (anchor?.y ?? 0) + 80,
        params: {},
      };
      added.push(node);
      controls[node.id] = defaultControlState(entry);
      placed++;
    }
    if (!added.length) return null;
    return { nodes: [...s.nodes, ...added], controls };
  }
  if (fix.kind === 'addCircuit') {
    const load = s.nodes.find((n) => n.id === fix.loadNodeId);
    const panel = s.nodes.find((n) => n.id === fix.panelNodeId);
    if (!load || !panel) return null;
    const already = s.edges.some((e) => e.target === load.id || e.source === load.id);
    if (already) return null;
    const mcbId = uid('n');
    const cableId = uid('n');
    const mcbEntry = getCatalogEntry('mcb-c16');
    const cableEntry = getCatalogEntry('cable-lv-cu-2.5');
    if (!mcbEntry || !cableEntry) return null;
    const mcbX = load.x - 36;
    const mcbY = load.y;
    const mcb: DesignNode = { id: mcbId, catalogId: 'mcb-c16', label: 'Auto MCB', x: mcbX, y: mcbY, params: {} };
    const loadCx = load.x + 21;
    const loadCy = load.y + 21;
    const cable: DesignNode = {
      id: cableId,
      catalogId: 'cable-lv-cu-2.5',
      label: 'Auto cable',
      x: mcbX,
      y: mcbY + 20,
      params: {
        lengthM: 12,
        rotation: 0,
        routePoints: serializeRoutePoints([
          { x: mcbX + 20, y: mcbY + 9 },
          { x: loadCx, y: loadCy },
        ]),
        showOnMap: false,
      },
    };
    return {
      nodes: [...s.nodes, mcb, cable],
      edges: [
        ...s.edges,
        { id: uid('e'), source: panel.id, sourceHandle: 'out', target: mcbId, targetHandle: 'line' },
        { id: uid('e'), source: mcbId, sourceHandle: 'load', target: cableId, targetHandle: 'a' },
        { id: uid('e'), source: cableId, sourceHandle: 'b', target: load.id, targetHandle: 'in' },
      ],
      controls: { ...s.controls, [mcbId]: defaultControlState(mcbEntry) },
    };
  }
  if (fix.kind === 'addSource') {
    const entry = getCatalogEntry(fix.catalogId);
    if (!entry) return null;
    const panel = findMainPanel(s.nodes);
    const srcId = uid('n');
    const src: DesignNode = {
      id: srcId,
      catalogId: fix.catalogId,
      label: defaultLabel(entry, s.locale),
      x: (panel?.x ?? 0) - 160,
      y: panel?.y ?? 120,
      params: {},
    };
    const edges = panel
      ? [...s.edges, { id: uid('e'), source: srcId, sourceHandle: 'out', target: panel.id, targetHandle: 'in' }]
      : s.edges;
    return { nodes: [...s.nodes, src], edges, controls: { ...s.controls, [srcId]: defaultControlState(entry) } };
  }
  if (fix.kind === 'upgradeBreaker') {
    const replacement = getCatalogEntry(fix.toCatalogId);
    if (!replacement) return null;
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

function fixKey(f: Fix): string {
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
    case 'addGrounding':
      return 'addGrounding';
    case 'addSource':
      return 'addSource';
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

  for (const f of fixes) {
    if (f.kind === 'addPsu') {
      if (!psuAdded && psuCount > 0) {
        out.push({ kind: 'addPsu', count: psuCount });
        psuAdded = true;
      }
      continue;
    }
    const key = fixKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

const FIX_ORDER: Record<Fix['kind'], number> = {
  addSource: 0,
  addGrounding: 1,
  addPsu: 2,
  replaceCatalog: 3,
  upgradeBreaker: 3,
  replaceBreaker: 3,
  resizeCable: 4,
  setParam: 4,
  moveNode: 5,
  addCircuit: 6,
};

export function prioritizeFixes(fixes: Fix[], maxCircuits = 20): Fix[] {
  const sorted = dedupeFixes(fixes).sort((a, b) => (FIX_ORDER[a.kind] ?? 9) - (FIX_ORDER[b.kind] ?? 9));
  let circuits = 0;
  return sorted.filter((f) => {
    if (f.kind !== 'addCircuit') return true;
    if (circuits >= maxCircuits) return false;
    circuits += 1;
    return true;
  });
}

export function applyAllFixPatches(s: FixableState, fixes: Fix[]): FixableState {
  let nodes = s.nodes;
  let edges = s.edges;
  let controls = s.controls;
  for (const fix of prioritizeFixes(fixes)) {
    const patch = applyFixPatch({ ...s, nodes, edges, controls }, fix);
    if (!patch) continue;
    if (patch.nodes) nodes = patch.nodes;
    if (patch.edges) edges = patch.edges;
    if (patch.controls) controls = patch.controls;
  }
  return { ...s, nodes, edges, controls };
}

const FIX_CHUNK_SIZE = 5;

/** Apply fixes in small batches so the UI stays responsive. */
export function runBatchedFixes(
  getState: () => FixableState,
  setState: (next: FixableState, done: boolean) => void,
  fixes: Fix[],
  onDone?: () => void,
): void {
  const queue = prioritizeFixes(fixes);
  if (!queue.length) {
    onDone?.();
    return;
  }
  let index = 0;
  const step = () => {
    const batch = queue.slice(index, index + FIX_CHUNK_SIZE);
    index += FIX_CHUNK_SIZE;
    const done = index >= queue.length;
    const s = getState();
    const next = applyAllFixPatches(s, batch);
    setState(next, done);
    if (!done) {
      window.requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  window.requestAnimationFrame(step);
}
