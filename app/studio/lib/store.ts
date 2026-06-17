'use client';

import { create } from 'zustand';
import { CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';
import type { DesignNode, DesignEdge, DesignRoom } from './model';
import { resolveNodes } from './model';
import type { Fix } from './engine/validation';
import { STUDIO_LOCALES, type StudioLocale } from './i18n';
import { buildSampleDesign } from './sample';
import { defaultControlState, type ControlState } from './controls';
import { assignAddresses, makeTelegram, type Telegram } from './engine/bus';
import { defaultProject, normalizeProject, type ProjectInfo } from './project';
import { buildStarterDesign } from './engine/starter-design';
import { detectRoomsFromMap as detectRooms } from './engine/plan-detect';
import { aggregateSimulation } from './engine/sim-metrics';
import { simulate } from './engine/simulate';

export type Theme = 'dark' | 'light';
export type FloorPlanTool = 'select' | 'draw-room';

export type DesignFile = {
  version: 1;
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  map: MapBackground | null;
  project?: ProjectInfo;
  rooms?: DesignRoom[];
};

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
  telegrams: Telegram[];
  project: ProjectInfo;
  rooms: DesignRoom[];
  selectedRoomId: string | null;
  floorPlanTool: FloorPlanTool;
  cloudProjectId: string | null;
  simEnergyKwh: number;

  setLocale: (l: StudioLocale) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleDeclarations: () => void;

  addNodeFromCatalog: (catalogId: string, x: number, y: number) => void;
  moveNode: (id: string, x: number, y: number) => void;
  updateNodeLabel: (id: string, label: string) => void;
  replaceNodeCatalog: (id: string, catalogId: string) => void;
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

  setDesignName: (name: string) => void;
  updateProject: (patch: Partial<ProjectInfo>) => void;
  toggleStandard: (code: ProjectInfo['standards'][number]) => void;
  completeWizard: (project: ProjectInfo, generateDesign: boolean) => void;
  reopenWizard: () => void;

  setFloorPlanTool: (tool: FloorPlanTool) => void;
  addRoom: (room: Omit<DesignRoom, 'id'> & { id?: string }) => void;
  addRoomTemplate: (label: string, zone: DesignRoom['zone'], width: number, height: number) => void;
  seedDefaultRooms: () => void;
  updateRoom: (id: string, patch: Partial<DesignRoom>) => void;
  moveRoom: (id: string, x: number, y: number) => void;
  resizeRoom: (id: string, width: number, height: number) => void;
  removeRoom: (id: string) => void;
  selectRoom: (id: string | null) => void;

  duplicateNode: (id: string) => void;
  clearTelegrams: () => void;
  serialize: () => DesignFile;
  loadDesign: (file: DesignFile) => void;
  hydrate: () => void;
  setCloudProjectId: (id: string | null) => void;
  tickSimulation: () => void;
  detectRoomsFromMap: () => Promise<number>;
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
  telegrams: [],
  project: defaultProject(),
  rooms: [],
  selectedRoomId: null,
  floorPlanTool: 'select',
  cloudProjectId: null,
  simEnergyKwh: 0,

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

  updateNodeLabel: (id, label) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, label } : n)) })),

  replaceNodeCatalog: (id, catalogId) =>
    set((s) => {
      const entry = getCatalogEntry(catalogId);
      if (!entry) return s;
      return {
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, catalogId, label: defaultLabel(entry, s.locale) } : n,
        ),
        controls: { ...s.controls, [id]: defaultControlState(entry) },
      };
    }),

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

  select: (id) => set({ selectedNodeId: id, selectedRoomId: null }),

  setControl: (id, key, value) =>
    set((s) => {
      const controls = { ...s.controls, [id]: { ...s.controls[id], [key]: value } };
      // Emit a bus telegram when operating an automation device during sim.
      let telegrams = s.telegrams;
      if (s.simulating) {
        const node = s.nodes.find((n) => n.id === id);
        const entry = node ? getCatalogEntry(node.catalogId) : undefined;
        if (entry && (entry.domain === 'smarthome' || entry.domain === 'sensor')) {
          const addr = assignAddresses(s.nodes).get(id);
          if (addr) telegrams = [makeTelegram(entry, addr, key, value), ...s.telegrams].slice(0, 200);
        }
      }
      return { controls, telegrams };
    }),

  connect: (edge) =>
    set((s) => {
      const exists = s.edges.some(
        (e) => e.source === edge.source && e.target === edge.target && e.sourceHandle === edge.sourceHandle && e.targetHandle === edge.targetHandle,
      );
      if (exists) return s;
      return { edges: [...s.edges, { ...edge, id: uid('e') }] };
    }),

  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

  clear: () =>
    set({
      nodes: [],
      edges: [],
      rooms: [],
      selectedNodeId: null,
      selectedRoomId: null,
      designName: '',
      controls: {},
      project: defaultProject(),
      map: null,
      telegrams: [],
      floorPlanTool: 'select',
      cloudProjectId: null,
    }),

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

  toggleSimulation: () =>
    set((s) => ({
      simulating: !s.simulating,
      telegrams: s.simulating ? s.telegrams : [],
      simEnergyKwh: s.simulating ? s.simEnergyKwh : 0,
    })),

  setMap: (src, width, height) =>
    set({ map: { src, width, height, x: -width / 2, y: -height / 2, opacity: 0.85 } }),
  moveMap: (x, y) => set((s) => (s.map ? { map: { ...s.map, x, y } } : s)),
  setMapOpacity: (opacity) => set((s) => (s.map ? { map: { ...s.map, opacity } } : s)),
  clearMap: () => set({ map: null }),

  duplicateNode: (id) =>
    set((s) => {
      const src = s.nodes.find((n) => n.id === id);
      if (!src) return s;
      const entry = getCatalogEntry(src.catalogId);
      const copy: DesignNode = { ...src, id: uid('n'), x: src.x + 40, y: src.y + 40, params: { ...src.params } };
      return {
        nodes: [...s.nodes, copy],
        selectedNodeId: copy.id,
        controls: { ...s.controls, [copy.id]: entry ? defaultControlState(entry) : {} },
      };
    }),

  setDesignName: (name) => set({ designName: name }),

  updateProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),

  toggleStandard: (code) =>
    set((s) => {
      const has = s.project.standards.includes(code);
      return {
        project: {
          ...s.project,
          standards: has ? s.project.standards.filter((c) => c !== code) : [...s.project.standards, code],
        },
      };
    }),

  completeWizard: (project, generateDesign) => {
    const s = get();
    let rooms = s.rooms;
    if (rooms.length === 0) {
      rooms = seedRoomsForBuilding(project.buildingType);
    }
    let nodes = s.nodes;
    let edges = s.edges;
    let controls = s.controls;
    let designName = s.designName;
    if (generateDesign) {
      const starter = buildStarterDesign(project, s.locale, rooms);
      nodes = starter.nodes;
      edges = starter.edges;
      designName = starter.name;
      controls = {};
      for (const n of nodes) {
        const entry = getCatalogEntry(n.catalogId);
        if (entry) controls[n.id] = defaultControlState(entry);
      }
    }
    set({
      project,
      rooms,
      nodes,
      edges,
      controls,
      designName,
      selectedNodeId: null,
      selectedRoomId: null,
    });
  },

  reopenWizard: () => set((s) => ({ project: { ...s.project, setupComplete: false } })),

  setFloorPlanTool: (tool) => set({ floorPlanTool: tool }),

  addRoom: (room) => {
    const id = room.id ?? uid('room');
    const r: DesignRoom = { id, label: room.label, x: room.x, y: room.y, width: room.width, height: room.height, zone: room.zone };
    set((s) => ({ rooms: [...s.rooms, r], selectedRoomId: id, selectedNodeId: null }));
  },

  addRoomTemplate: (label, zone, width, height) => {
    const offset = get().rooms.length * 24;
    get().addRoom({ label, zone, x: -120 + offset, y: -80 + offset, width, height });
  },

  seedDefaultRooms: () => set({ rooms: seedRoomsForBuilding(get().project.buildingType), selectedRoomId: null }),

  updateRoom: (id, patch) => set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

  moveRoom: (id, x, y) => set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, x, y } : r)) })),

  resizeRoom: (id, width, height) =>
    set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, width: Math.max(60, width), height: Math.max(50, height) } : r)) })),

  removeRoom: (id) =>
    set((s) => ({
      rooms: s.rooms.filter((r) => r.id !== id),
      selectedRoomId: s.selectedRoomId === id ? null : s.selectedRoomId,
    })),

  selectRoom: (id) => set({ selectedRoomId: id, selectedNodeId: null }),

  clearTelegrams: () => set({ telegrams: [] }),

  serialize: () => {
    const s = get();
    return {
      version: 1,
      designName: s.designName,
      nodes: s.nodes,
      edges: s.edges,
      controls: s.controls,
      map: s.map,
      project: s.project,
      rooms: s.rooms,
    };
  },

  loadDesign: (file) =>
    set({
      designName: file.designName ?? '',
      project: normalizeProject(file.project),
      rooms: file.rooms ?? [],
      nodes: file.nodes ?? [],
      edges: file.edges ?? [],
      controls: file.controls ?? {},
      map: file.map ?? null,
      selectedNodeId: null,
      selectedRoomId: null,
      telegrams: [],
      simulating: false,
      simEnergyKwh: 0,
    }),

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('studio.design');
      if (raw) {
        const file = JSON.parse(raw) as DesignFile;
        if (file && file.version === 1) get().loadDesign(file);
      }
      const cloudId = window.localStorage.getItem('studio.cloudProjectId');
      if (cloudId) set({ cloudProjectId: cloudId });
    } catch {
      /* ignore corrupt autosave */
    }
  },

  setCloudProjectId: (id) => {
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem('studio.cloudProjectId', id);
      else window.localStorage.removeItem('studio.cloudProjectId');
    }
    set({ cloudProjectId: id });
  },

  tickSimulation: () => {
    const s = get();
    if (!s.simulating) return;
    const resolved = resolveNodes(s.nodes, getCatalogEntry);
    const states = simulate(resolved, s.edges, s.controls);
    const m = aggregateSimulation(resolved, states);
    set({ simEnergyKwh: s.simEnergyKwh + m.totalKw / 3600 });
  },

  detectRoomsFromMap: async () => {
    const s = get();
    if (!s.map?.src) return 0;
    const detected = await detectRooms(s.map.src, s.map.x, s.map.y, s.map.width, s.map.height);
    const rooms = detected.map((r) => ({ ...r, id: uid('room') }));
    set({ rooms, selectedRoomId: null });
    return rooms.length;
  },
}));

// Debounced autosave of the design to localStorage.
if (typeof window !== 'undefined') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  useStudio.subscribe((s) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const file: DesignFile = {
        version: 1,
        designName: s.designName,
        nodes: s.nodes,
        edges: s.edges,
        controls: s.controls,
        map: s.map,
        project: s.project,
        rooms: s.rooms,
      };
      try {
        window.localStorage.setItem('studio.design', JSON.stringify(file));
      } catch {
        /* quota / serialization issues ignored */
      }
    }, 700);
  });
}

function pickBreaker(rating: number): CatalogEntry | undefined {
  const protections = CATALOG.filter((e) => e.domain === 'protection') as Extract<CatalogEntry, { domain: 'protection' }>[];
  return protections
    .filter((p) => p.protectionType === 'MCB' || p.protectionType === 'MCCB')
    .sort((a, b) => a.ratedCurrentA - b.ratedCurrentA)
    .find((p) => p.ratedCurrentA >= rating);
}

function seedRoomsForBuilding(bt: ProjectInfo['buildingType']): DesignRoom[] {
  if (bt === 'apartment' || bt === 'house' || bt === 'villa') {
    return [
      { id: 'room_living', label: 'Living', x: -220, y: -140, width: 300, height: 200, zone: 'general' },
      { id: 'room_kitchen', label: 'Kitchen', x: 100, y: -140, width: 180, height: 140, zone: 'kitchen' },
      { id: 'room_bed', label: 'Bedroom', x: -220, y: 80, width: 200, height: 160, zone: 'bedroom' },
      { id: 'room_bath', label: 'Bathroom', x: 20, y: 80, width: 120, height: 100, zone: 'bathroom' },
    ];
  }
  return [
    { id: 'room_lobby', label: 'Lobby', x: -260, y: -160, width: 340, height: 180, zone: 'general' },
    { id: 'room_office', label: 'Office', x: 100, y: -160, width: 220, height: 180, zone: 'office' },
    { id: 'room_mech', label: 'MEP', x: -260, y: 40, width: 160, height: 140, zone: 'mechanical' },
  ];
}
