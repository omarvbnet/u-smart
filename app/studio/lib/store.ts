'use client';

import { create } from 'zustand';
import { CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';
import type { DesignNode, DesignEdge } from './model';
import type { Fix } from './engine/validation';
import { STUDIO_LOCALES, type StudioLocale } from './i18n';
import { buildSampleDesign } from './sample';
import { defaultControlState, type ControlState } from './controls';

export type Theme = 'dark' | 'light';

export type MapBackground = {
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
};

type StudioState = {
  locale: StudioLocale;
  theme: Theme;
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  selectedNodeId: string | null;
  simulating: boolean;
  showDeclarations: boolean;
  controls: Record<string, ControlState>;
  map: MapBackground | null;

  setLocale: (l: StudioLocale) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleDeclarations: () => void;

  addNodeFromCatalog: (catalogId: string, x: number, y: number) => void;
  moveNode: (id: string, x: number, y: number) => void;
  updateNodeParam: (id: string, key: string, value: number | string | boolean) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
  setControl: (id: string, key: keyof ControlState, value: boolean | number) => void;

  connect: (edge: Omit<DesignEdge, 'id'>) => void;
  removeEdge: (id: string) => void;

  clear: () => void;
  loadSample: () => void;

  applyFix: (fix: Fix) => void;
  toggleSimulation: () => void;

  setMap: (src: string, width: number, height: number) => void;
  moveMap: (x: number, y: number) => void;
  setMapOpacity: (opacity: number) => void;
  clearMap: () => void;
};

let counter = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

function persist(key: string, value: string) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}

function initialLocale(): StudioLocale {
  if (typeof window === 'undefined') return 'ar';
  const saved = window.localStorage.getItem('studio.locale');
  if (saved && (STUDIO_LOCALES as readonly string[]).includes(saved)) return saved as StudioLocale;
  return 'ar';
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem('studio.theme') === 'light' ? 'light' : 'dark';
}

function defaultLabel(entry: CatalogEntry, locale: StudioLocale): string {
  return entry.name[locale] ?? entry.name.en;
}

export const useStudio = create<StudioState>((set, get) => ({
  locale: initialLocale(),
  theme: initialTheme(),
  designName: '',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  simulating: false,
  showDeclarations: false,
  controls: {},
  map: null,

  setLocale: (l) => {
    persist('studio.locale', l);
    set({ locale: l });
  },
  setTheme: (t) => {
    persist('studio.theme', t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    persist('studio.theme', next);
    set({ theme: next });
  },
  toggleDeclarations: () => set((s) => ({ showDeclarations: !s.showDeclarations })),

  addNodeFromCatalog: (catalogId, x, y) => {
    const entry = getCatalogEntry(catalogId);
    if (!entry) return;
    const params: DesignNode['params'] = {};
    if (entry.domain === 'cable') params.lengthM = 20;
    const node: DesignNode = { id: uid('n'), catalogId, label: defaultLabel(entry, get().locale), x, y, params };
    set((s) => ({
      nodes: [...s.nodes, node],
      selectedNodeId: node.id,
      controls: { ...s.controls, [node.id]: defaultControlState(entry) },
    }));
  },

  moveNode: (id, x, y) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) })),

  updateNodeParam: (id, key, value) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) })),

  removeNode: (id) =>
    set((s) => {
      const controls = { ...s.controls };
      delete controls[id];
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        controls,
      };
    }),

  select: (id) => set({ selectedNodeId: id }),

  setControl: (id, key, value) =>
    set((s) => ({ controls: { ...s.controls, [id]: { ...s.controls[id], [key]: value } } })),

  connect: (edge) =>
    set((s) => {
      const exists = s.edges.some(
        (e) => e.source === edge.source && e.target === edge.target && e.sourceHandle === edge.sourceHandle && e.targetHandle === edge.targetHandle,
      );
      if (exists) return s;
      return { edges: [...s.edges, { ...edge, id: uid('e') }] };
    }),

  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  clear: () => set({ nodes: [], edges: [], selectedNodeId: null, designName: '', controls: {} }),

  loadSample: () => {
    const { nodes, edges, name } = buildSampleDesign(get().locale);
    const controls: Record<string, ControlState> = {};
    for (const n of nodes) {
      const entry = getCatalogEntry(n.catalogId);
      if (entry) controls[n.id] = defaultControlState(entry);
    }
    set({ nodes, edges, designName: name, selectedNodeId: null, controls });
  },

  applyFix: (fix) => {
    set((s) => {
      if (fix.kind === 'resizeCable') {
        return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(getCatalogEntry(fix.toCatalogId)!, s.locale) } : n)) };
      }
      if (fix.kind === 'replaceBreaker') {
        const replacement = pickBreaker(fix.toRating);
        if (!replacement) return s;
        return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, catalogId: replacement.id, label: defaultLabel(replacement, s.locale) } : n)) };
      }
      if (fix.kind === 'setParam') {
        return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, params: { ...n.params, [fix.key]: fix.value } } : n)) };
      }
      if (fix.kind === 'addGrounding') {
        const spd = CATALOG.find((e) => e.domain === 'protection' && e.id === 'spd-t2');
        if (!spd) return s;
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
      return s;
    });
  },

  toggleSimulation: () => set((s) => ({ simulating: !s.simulating })),

  setMap: (src, width, height) =>
    set({ map: { src, width, height, x: -width / 2, y: -height / 2, opacity: 0.85 } }),
  moveMap: (x, y) => set((s) => (s.map ? { map: { ...s.map, x, y } } : s)),
  setMapOpacity: (opacity) => set((s) => (s.map ? { map: { ...s.map, opacity } } : s)),
  clearMap: () => set({ map: null }),
}));

function pickBreaker(rating: number): CatalogEntry | undefined {
  const protections = CATALOG.filter((e) => e.domain === 'protection') as Extract<CatalogEntry, { domain: 'protection' }>[];
  return protections
    .filter((p) => p.protectionType === 'MCB' || p.protectionType === 'MCCB')
    .sort((a, b) => a.ratedCurrentA - b.ratedCurrentA)
    .find((p) => p.ratedCurrentA >= rating);
}
