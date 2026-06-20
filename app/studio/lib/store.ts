'use client';

import { create } from 'zustand';
import { CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';
import type { DesignNode, DesignEdge, DesignRoom, BimModel } from './model';
import { resolveNodes } from './model';
import type { Fix, Issue } from './engine/validation';
import { validateDesign } from './engine/validation';
import { validatePlacement } from './engine/placement-validation';
import { suggestSmartFixes } from './engine/autofix';
import { CABLES } from './catalog/cables';
import type { CableSpec } from './catalog';
import { STUDIO_LOCALES, type StudioLocale } from './i18n';
import { buildSampleDesign } from './sample';
import { defaultControlState, type ControlState } from './controls';
import { assignAddresses, makeTelegram, type Telegram } from './engine/bus';
import { defaultProject, normalizeProject, type ProjectInfo, type FloorPlanSource } from './project';
import { blankFloorPlanDataUrl, floorPlanSizeForBuilding } from './blank-floor-plan';
import { buildStarterDesign, enhanceDesignPlacement } from './engine/starter-design';
import { detectRoomsFromMap as detectRooms, detectBimFromMap } from './engine/plan-detect';
import { getTwinConnection } from './twin-stream';
import { psuCatalogId, findMainPanel } from './engine/autofix';
import { aggregateSimulation } from './engine/sim-metrics';
import { simulate } from './engine/simulate';
import { executeDesignCommand as runDesignCommand } from './nl/design-commands';
import { parseProjectBrief, isGenerateBriefCommand } from './nl/parse-brief';
import { runAutonomousPipeline } from './platform/pipeline';
import type { VisualizationMode, ExperienceMode } from './visualization/modes';

export type Theme = 'dark' | 'light';
export type FloorPlanTool = 'select' | 'draw-room';
/** `content` = zoom to rooms & elements; `full` = include the entire map layer. */
export type CanvasViewMode = 'content' | 'full';

export type DesignFile = {
  version: 1;
  designName: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  map: MapBackground | null;
  project?: ProjectInfo;
  rooms?: DesignRoom[];
  bim?: BimModel;
};

export type MapBackground = {
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  /** `blank` = procedural grid canvas; `image` = imported PDF/photo. */
  mode?: 'blank' | 'image';
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
  pendingMapImport: boolean;
  canvasViewMode: CanvasViewMode;
  canvasFitSeq: number;
  visualizationMode: VisualizationMode;
  experienceMode: ExperienceMode;
  assistantOpen: boolean;
  autonomousAssumptions: string[];
  bim: BimModel | null;
  showLuxHeatmap: boolean;
  showLoadHeatmap: boolean;
  twinSessionId: string | null;
  twinConnected: boolean;

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

  setMap: (src: string, width: number, height: number, bim?: BimModel | null) => void;
  moveMap: (x: number, y: number) => void;
  setMapOpacity: (opacity: number) => void;
  clearMap: () => void;
  createMapFromZero: () => void;
  clearPendingMapImport: () => void;

  setDesignName: (name: string) => void;
  updateProject: (patch: Partial<ProjectInfo>) => void;
  toggleStandard: (code: ProjectInfo['standards'][number]) => void;
  completeWizard: (
    project: ProjectInfo,
    options: { generateDesign: boolean; floorPlan: FloorPlanSource | 'skip' },
  ) => void;
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
  setCanvasViewMode: (mode: CanvasViewMode) => void;
  fitCanvasView: () => void;
  setVisualizationMode: (mode: VisualizationMode) => void;
  setExperienceMode: (mode: ExperienceMode) => void;
  toggleExperienceMode: () => void;
  setAssistantOpen: (open: boolean) => void;
  executeDesignCommand: (text: string) => { ok: boolean; message: string; changes: number };
  generateFromBrief: (text: string) => { ok: boolean; message: string; assumptions: string[] };
  setBim: (bim: BimModel | null) => void;
  toggleLuxHeatmap: () => void;
  toggleLoadHeatmap: () => void;
  placeEngineeringLayout: () => { ok: boolean; message: string; changes: number };
  analyzePlanFull: () => Promise<{ rooms: number; walls: number }>;
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

function initialCanvasViewMode(): CanvasViewMode {
  if (typeof window === 'undefined') return 'content';
  return window.localStorage.getItem('studio.canvasViewMode') === 'full' ? 'full' : 'content';
}

function initialVisualizationMode(): VisualizationMode {
  if (typeof window === 'undefined') return 'engineering';
  const v = window.localStorage.getItem('studio.visualizationMode');
  return v === 'product' || v === '3d' ? v : 'engineering';
}

function initialExperienceMode(): ExperienceMode {
  if (typeof window === 'undefined') return 'engineer';
  return window.localStorage.getItem('studio.experienceMode') === 'client' ? 'client' : 'engineer';
}

function initialLuxHeatmap(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('studio.luxHeatmap') === '1';
}

function initialLoadHeatmap(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('studio.loadHeatmap') === '1';
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
  pendingMapImport: false,
  canvasViewMode: initialCanvasViewMode(),
  canvasFitSeq: 0,
  visualizationMode: initialVisualizationMode(),
  experienceMode: initialExperienceMode(),
  assistantOpen: false,
  autonomousAssumptions: [],
  bim: null,
  showLuxHeatmap: initialLuxHeatmap(),
  showLoadHeatmap: initialLoadHeatmap(),
  twinSessionId: null,
  twinConnected: false,

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
    if (entry.domain === 'cable') {
      params.lengthM = 20;
      params.rotation = 0;
    }
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
        nodes: s.nodes.map((n) => {
          if (n.id !== id) return n;
          const params = { ...n.params };
          if (entry.domain !== 'cable') {
            delete params.rotation;
          } else if (params.rotation === undefined) {
            params.rotation = 0;
          }
          return { ...n, catalogId, label: defaultLabel(entry, s.locale), params };
        }),
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
      let telegrams = s.telegrams;
      if (s.simulating) {
        const node = s.nodes.find((n) => n.id === id);
        const entry = node ? getCatalogEntry(node.catalogId) : undefined;
        if (entry && (entry.domain === 'smarthome' || entry.domain === 'sensor')) {
          const addr = assignAddresses(s.nodes).get(id);
          if (addr) telegrams = [makeTelegram(entry, addr, key, value), ...s.telegrams].slice(0, 200);
        }
        if (s.twinSessionId) {
          void getTwinConnection().pushControl(id, key, value);
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
      bim: null,
      telegrams: [],
      floorPlanTool: 'select',
      cloudProjectId: null,
      pendingMapImport: false,
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
      if (fix.kind === 'moveNode') {
        return { nodes: s.nodes.map((n) => (n.id === fix.nodeId ? { ...n, x: fix.x, y: fix.y } : n)) };
      }
      if (fix.kind === 'replaceCatalog') {
        const replacement = getCatalogEntry(fix.toCatalogId);
        if (!replacement) return s;
        return {
          nodes: s.nodes.map((n) =>
            n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(replacement, s.locale) } : n,
          ),
          controls: { ...s.controls, [fix.nodeId]: defaultControlState(replacement) },
        };
      }
      if (fix.kind === 'addPsu') {
        const catId = psuCatalogId(s.project);
        const entry = getCatalogEntry(catId);
        if (!entry) return s;
        const added: DesignNode[] = [];
        const controls = { ...s.controls };
        const anchor = s.nodes.find((n) => getCatalogEntry(n.catalogId)?.domain === 'smarthome') ?? s.nodes[0];
        for (let i = 0; i < fix.count; i++) {
          const node: DesignNode = {
            id: uid('n'),
            catalogId: catId,
            label: `${defaultLabel(entry, s.locale)} PSU`,
            x: (anchor?.x ?? 0) + 50 + i * 36,
            y: (anchor?.y ?? 0) + 80,
            params: {},
          };
          added.push(node);
          controls[node.id] = defaultControlState(entry);
        }
        return { nodes: [...s.nodes, ...added], controls };
      }
      if (fix.kind === 'addCircuit') {
        const load = s.nodes.find((n) => n.id === fix.loadNodeId);
        const panel = s.nodes.find((n) => n.id === fix.panelNodeId);
        if (!load || !panel) return s;
        const mcbId = uid('n');
        const cableId = uid('n');
        const mcbEntry = getCatalogEntry('mcb-c16');
        const cableEntry = getCatalogEntry('cable-lv-cu-2.5');
        if (!mcbEntry || !cableEntry) return s;
        const mcbX = load.x - 36;
        const mcbY = load.y;
        const mcb: DesignNode = { id: mcbId, catalogId: 'mcb-c16', label: 'Auto MCB', x: mcbX, y: mcbY, params: {} };
        const cable: DesignNode = {
          id: cableId,
          catalogId: 'cable-lv-cu-2.5',
          label: 'Auto cable',
          x: mcbX,
          y: mcbY + 20,
          params: { lengthM: 12, rotation: 0 },
        };
        return {
          nodes: [...s.nodes, mcb, cable],
          edges: [
            ...s.edges,
            { id: uid('e'), source: panel.id, sourceHandle: 'out', target: mcbId, targetHandle: 'line' },
            { id: uid('e'), source: mcbId, sourceHandle: 'load', target: cableId, targetHandle: 'a' },
            { id: uid('e'), source: cableId, sourceHandle: 'b', target: load.id, targetHandle: 'in' },
          ],
          controls: {
            ...s.controls,
            [mcbId]: defaultControlState(mcbEntry),
          },
        };
      }
      if (fix.kind === 'addSource') {
        const entry = getCatalogEntry(fix.catalogId);
        if (!entry) return s;
        const panel = findMainPanelNodes(s.nodes)[0];
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
        if (!replacement) return s;
        return {
          nodes: s.nodes.map((n) =>
            n.id === fix.nodeId ? { ...n, catalogId: fix.toCatalogId, label: defaultLabel(replacement, s.locale) } : n,
          ),
          controls: { ...s.controls, [fix.nodeId]: defaultControlState(replacement) },
        };
      }
      return s;
    });
  },

  toggleSimulation: () => {
    const s = get();
    if (s.simulating) {
      void getTwinConnection().stop();
      set({ simulating: false, twinSessionId: null, twinConnected: false });
      return;
    }
    set({ simulating: true, telegrams: [], simEnergyKwh: 0, twinConnected: false, twinSessionId: null });
    void getTwinConnection()
      .start(s.nodes, s.edges, s.controls)
      .then((ok) => set({ twinConnected: ok }));
  },

  setMap: (src, width, height, bim?: BimModel | null) =>
    set({
      map: { src, width, height, x: -width / 2, y: -height / 2, opacity: 0.85, mode: 'image' },
      project: { ...get().project, floorPlanSource: 'import' },
      bim: bim ?? get().bim,
    }),
  moveMap: (x, y) => set((s) => (s.map ? { map: { ...s.map, x, y } } : s)),
  setMapOpacity: (opacity) => set((s) => (s.map ? { map: { ...s.map, opacity } } : s)),
  clearMap: () =>
    set((s) => ({
      map: null,
      bim: null,
      project: { ...s.project, floorPlanSource: s.project.floorPlanSource === 'import' ? 'none' : s.project.floorPlanSource },
    })),

  createMapFromZero: () => {
    const s = get();
    const { width, height } = floorPlanSizeForBuilding(s.project.buildingType);
    const src = blankFloorPlanDataUrl(width, height);
    const rooms = s.rooms.length > 0 ? s.rooms : seedRoomsForBuilding(s.project.buildingType);
    set({
      map: { src, width, height, x: -width / 2, y: -height / 2, opacity: 1, mode: 'blank' },
      rooms,
      floorPlanTool: 'draw-room',
      selectedRoomId: null,
      project: { ...s.project, floorPlanSource: 'zero' },
    });
  },

  clearPendingMapImport: () => set({ pendingMapImport: false }),

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

  completeWizard: (project, options) => {
    const s = get();
    const floorPlanSource: FloorPlanSource =
      options.floorPlan === 'zero' ? 'zero' : options.floorPlan === 'import' ? 'import' : 'none';
    const mergedProject = { ...project, floorPlanSource };
    let rooms = s.rooms;
    if (rooms.length === 0) {
      rooms = seedRoomsForBuilding(mergedProject.buildingType);
    }
    let nodes = s.nodes;
    let edges = s.edges;
    let controls = s.controls;
    let designName = s.designName;
    let map = s.map;
    let floorPlanTool = s.floorPlanTool;
    let pendingMapImport = false;

    if (options.floorPlan === 'zero') {
      const { width, height } = floorPlanSizeForBuilding(mergedProject.buildingType);
      map = {
        src: blankFloorPlanDataUrl(width, height),
        width,
        height,
        x: -width / 2,
        y: -height / 2,
        opacity: 1,
        mode: 'blank',
      };
      floorPlanTool = 'draw-room';
    } else if (options.floorPlan === 'import') {
      pendingMapImport = true;
    }

    if (options.generateDesign) {
      const starter = buildStarterDesign(mergedProject, s.locale, rooms);
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
      project: mergedProject,
      rooms,
      nodes,
      edges,
      controls,
      designName,
      map,
      floorPlanTool,
      pendingMapImport,
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
      bim: s.bim ?? undefined,
    };
  },

  loadDesign: (file) =>
    set({
      designName: file.designName ?? '',
      project: normalizeProject(file.project),
      rooms: file.rooms ?? [],
      bim: file.bim ?? null,
      nodes: file.nodes ?? [],
      edges: file.edges ?? [],
      controls: file.controls ?? {},
      map: file.map ?? null,
      selectedNodeId: null,
      selectedRoomId: null,
      telegrams: [],
      simulating: false,
      simEnergyKwh: 0,
      floorPlanTool: file.map?.mode === 'blank' ? 'draw-room' : 'select',
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
    if (!s.map?.src || s.map.mode === 'blank') return 0;
    const detected = await detectRooms(s.map.src, s.map.x, s.map.y, s.map.width, s.map.height);
    const rooms = detected.map((r) => ({ ...r, id: uid('room') }));
    let bim = s.bim;
    if (!bim || bim.walls.length === 0) {
      try {
        bim = await detectBimFromMap(s.map.src, s.map.x, s.map.y, s.map.width, s.map.height);
      } catch {
        /* optional */
      }
    }
    set({ rooms, bim, selectedRoomId: null });
    return rooms.length;
  },

  setCanvasViewMode: (mode) => {
    persist('studio.canvasViewMode', mode);
    set((s) => ({ canvasViewMode: mode, canvasFitSeq: s.canvasFitSeq + 1 }));
  },

  fitCanvasView: () => set((s) => ({ canvasFitSeq: s.canvasFitSeq + 1 })),

  setVisualizationMode: (mode) => {
    persist('studio.visualizationMode', mode);
    set((s) => ({ visualizationMode: mode, canvasFitSeq: s.canvasFitSeq + 1 }));
  },

  setExperienceMode: (mode) => {
    persist('studio.experienceMode', mode);
    set({ experienceMode: mode, assistantOpen: mode === 'engineer' ? get().assistantOpen : false });
    if (mode === 'client' && !get().simulating) get().toggleSimulation();
  },

  toggleExperienceMode: () => {
    const next = get().experienceMode === 'engineer' ? 'client' : 'engineer';
    get().setExperienceMode(next);
  },

  setAssistantOpen: (open) => set({ assistantOpen: open }),

  executeDesignCommand: (text): { ok: boolean; message: string; changes: number } => {
    if (isGenerateBriefCommand(text)) {
      const gen = get().generateFromBrief(text);
      return { ok: gen.ok, message: gen.message, changes: gen.ok ? 1 : 0 };
    }
    const s = get();
    return runDesignCommand(text, {
      getState: get,
      addNodeFromCatalog: s.addNodeFromCatalog,
      replaceNodeCatalog: s.replaceNodeCatalog,
      moveNode: s.moveNode,
      updateProject: s.updateProject,
      setControl: s.setControl,
      applyFix: s.applyFix,
      getIssues: () => collectIssues(get()),
      placeEngineeringLayout: () => get().placeEngineeringLayout(),
    });
  },

  generateFromBrief: (text) => {
    try {
      const parsed = parseProjectBrief(text, get().project);
      const result = runAutonomousPipeline(parsed.project, parsed.rooms, get().locale);
      set({
        project: result.project,
        designName: parsed.designName,
        nodes: result.nodes,
        edges: result.edges,
        rooms: result.rooms,
        controls: result.controls,
        map: result.map,
        floorPlanTool: 'select',
        selectedNodeId: null,
        selectedRoomId: null,
        autonomousAssumptions: [...parsed.assumptions, ...result.assumptions],
        canvasFitSeq: get().canvasFitSeq + 1,
      });
      return {
        ok: true,
        message: `Autonomous design generated: ${result.nodes.length} devices, ${result.rooms.length} rooms, BOQ ≈ $${Math.round(result.boqGrandTotal)}.`,
        assumptions: get().autonomousAssumptions,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Generation failed', assumptions: [] };
    }
  },

  setBim: (bim) => set({ bim }),

  toggleLuxHeatmap: () => {
    const next = !get().showLuxHeatmap;
    persist('studio.luxHeatmap', next ? '1' : '0');
    set({ showLuxHeatmap: next });
  },

  toggleLoadHeatmap: () => {
    const next = !get().showLoadHeatmap;
    persist('studio.loadHeatmap', next ? '1' : '0');
    set({ showLoadHeatmap: next });
  },

  analyzePlanFull: async () => {
    const rooms = await get().detectRoomsFromMap();
    const bim = get().bim;
    return { rooms, walls: bim?.walls.length ?? 0 };
  },

  placeEngineeringLayout: () => {
    const s = get();
    const before = s.nodes.length;
    const placed = enhanceDesignPlacement(s.project, s.rooms, s.nodes, s.edges);
    set({ nodes: placed.nodes, edges: placed.edges });
    const added = placed.nodes.length - before;
    return {
      ok: true,
      message: `Engineering layout updated: ${added >= 0 ? added : 0} devices placed from lighting/HVAC calculations.`,
      changes: Math.max(0, added),
    };
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
        bim: s.bim ?? undefined,
      };
      try {
        window.localStorage.setItem('studio.design', JSON.stringify(file));
      } catch {
        /* quota / serialization issues ignored */
      }
    }, 700);
  });
}

function collectIssues(st: Pick<StudioState, 'nodes' | 'edges' | 'rooms' | 'project'>): Issue[] {
  const resolved = resolveNodes(st.nodes, getCatalogEntry);
  const { issues: eng } = validateDesign(resolved, st.edges, CABLES as CableSpec[]);
  const place = validatePlacement(st.nodes, st.rooms, getCatalogEntry);
  const smart = suggestSmartFixes(st.project, st.nodes, st.edges, st.rooms);
  return [...eng, ...place, ...smart];
}

function findMainPanelNodes(nodes: DesignNode[]): DesignNode[] {
  const p = findMainPanel(nodes);
  return p ? [p] : [];
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
