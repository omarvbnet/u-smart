/**
 * Apply validation auto-fixes to design state (single or batched).
 */
import { CATALOG, getCatalogEntry, type CatalogEntry, type SmartHomeSpec } from '../catalog';
import type { DesignNode, DesignEdge, DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import type { StudioLocale } from '../i18n';
import { defaultControlState, type ControlState } from '../controls';
import { findMainPanel, psuCatalogIdsForProject } from './autofix';
import { rerouteCableNode, serializeRoutePoints } from './cable-map';
import type { Fix } from './validation';

export type FixableState = {
  locale: StudioLocale;
  project: ProjectInfo;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  rooms: DesignRoom[];
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

export function rerouteDesignCables(s: FixableState): DesignNode[] {
  return s.nodes.map((n) =>
    getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, s.nodes, s.edges, s.rooms) : n,
  );
}

export function applyFixPatch(s: FixableState, fix: Fix): FixPatch | null {
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
        y: (anchor?.y ?? 0) + 80,
        params: { showOnMap: true },
      };
      added.push(node);
      controls[node.id] = defaultControlState(entry);
      const proto = (entry as SmartHomeSpec).protocol;
      const gw = gatewayForProtocol(s.nodes, proto);
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
    if (s.nodes.some((n) => n.catalogId === fix.catalogId)) return null;
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
    case 'addRoomLighting':
      return `addRoomLighting:${f.roomId}`;
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
  let groundingAdded = false;
  let sourceAdded = false;

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
    if (f.kind === 'addSource') {
      if (sourceAdded) continue;
      sourceAdded = true;
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
  addRoomLighting: 3,
  replaceCatalog: 4,
  upgradeBreaker: 4,
  replaceBreaker: 4,
  resizeCable: 5,
  setParam: 5,
  moveNode: 6,
  addCircuit: 7,
};

export function prioritizeFixes(fixes: Fix[], maxCircuits = 200): Fix[] {
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
  let state = s;
  let applied = 0;
  for (const fix of prioritizeFixes(fixes)) {
    const patch = applyFixPatch(state, fix);
    if (!patch) continue;
    state = mergeFixableState(state, patch);
    applied += 1;
  }
  if (!applied) return { state: s, applied: 0 };
  return { state, applied };
}
