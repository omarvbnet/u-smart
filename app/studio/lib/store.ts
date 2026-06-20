'use client';

import { create } from 'zustand';
import { CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';
import type { DesignNode, DesignEdge, DesignRoom, BimModel, DesignFloor, DesignGarden, DesignOpening } from './model';
import { resolveNodes } from './model';
import type { Fix, Issue } from './engine/validation';
import { validateDesign } from './engine/validation';
import { validatePlacement } from './engine/placement-validation';
import { applyFixPatch, applyAllFixPatches, rerouteDesignCables, type FixableState } from './engine/apply-fix';
import { CABLES } from './catalog/cables';
import type { CableSpec } from './catalog';
import { STUDIO_LOCALES, type StudioLocale } from './i18n';
import { buildSampleDesign } from './sample';
import { defaultControlState, type ControlState } from './controls';
import { assignAddresses, makeTelegram, type Telegram } from './engine/bus';
import { defaultProject, normalizeProject, type ProjectInfo, type FloorPlanSource } from './project';
import { blankFloorPlanDataUrl, floorPlanSizeForBuilding } from './blank-floor-plan';
import { buildStarterDesign, enhanceDesignPlacement } from './engine/starter-design';
import {
  seedRoomsForBuilding,
  isResidentialBuilding,
  defaultBedroomsForBuilding,
  bedroomRangeForBuilding,
  villaGardenBounds,
} from './engine/residential-layouts';
import { buildFloorsFromCount, seedRoomsForProject } from './engine/floor-layout';
import { detectRoomsFromMap as detectRooms, detectBimFromMap } from './engine/plan-detect';
import { getTwinConnection } from './twin-stream';
import { suggestSmartFixes, psuCatalogIdsForProject, findMainPanel } from './engine/autofix';
import { aggregateSimulation } from './engine/sim-metrics';
import { simulate } from './engine/simulate';
import { executeDesignCommand as runDesignCommand } from './nl/design-commands';
import { parseProjectBrief, isGenerateBriefCommand } from './nl/parse-brief';
import { runAutonomousPipeline } from './platform/pipeline';
import { applyHdlScene as runHdlScene, type HdlSceneId } from './engine/hdl-automation';
import { isBusPowerAdequate, busPowerStatus } from './engine/smarthome-topology';
import { validateLightingDesign } from './engine/lighting-validation';
import type { MapOverlayMode } from './engine/cable-map';
import { rerouteCableNode, parseRoutePoints, computeCableRoute, applyRouteToCable, type RoutePoint } from './engine/cable-map';
import { wireRoomLoads } from './engine/placement-layout';
import {
  placeSocketOutlets,
  placeAppliances,
  defaultPositionInRoom,
  type OutletCatalogId,
} from './engine/outlet-placement';
import {
  placeVrfDistribution,
  calculateVrfDistribution,
  indoorPositionInRoom,
} from './engine/vrf-distribution';
import type { HvacSpec } from './catalog';
import {
  buildBimOpenings,
  mergeOpeningActuators,
  syncOpeningsFromControls,
  actuatorsForOpenings,
} from './engine/opening-layout';
import {
  mergeEffectiveWalls,
  snapOpening,
  resnapOpeningsForRoom,
  orientOpeningOnWall,
  setWallLength,
  roomPatchForWallLength,
  isVirtualRoomWall,
} from './engine/wall-layout';
import type { VisualizationMode, ExperienceMode } from './visualization/modes';
import { cloneDesignSnapshot, HISTORY_LIMIT } from './history';

export type Theme = 'dark' | 'light';
export type FloorPlanTool = 'select' | 'draw-room' | 'place-door' | 'place-window';
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
  floors?: DesignFloor[];
  activeFloorId?: string;
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
  selectedOpeningId: string | null;
  selectedWallId: string | null;
  floorPlanTool: FloorPlanTool;
  cloudProjectId: string | null;
  simEnergyKwh: number;
  pendingMapImport: boolean;
  canvasViewMode: CanvasViewMode;
  canvasFitSeq: number;
  suppressCanvasFit: boolean;
  applyingFixes: boolean;
  visualizationMode: VisualizationMode;
  experienceMode: ExperienceMode;
  assistantOpen: boolean;
  autonomousAssumptions: string[];
  bim: BimModel | null;
  floors: DesignFloor[];
  activeFloorId: string;
  showLuxHeatmap: boolean;
  showLoadHeatmap: boolean;
  twinSessionId: string | null;
  twinConnected: boolean;
  mapOverlayMode: MapOverlayMode;
  editingCableRouteId: string | null;
  showCableRoutes3d: boolean;
  showOutletsOnMap: boolean;
  historyPast: ReturnType<typeof cloneDesignSnapshot>[];
  historyFuture: ReturnType<typeof cloneDesignSnapshot>[];

  undo: () => void;
  redo: () => void;

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
  setControl: (id: string, key: keyof ControlState, value: boolean | number, channelIndex?: number) => void;

  connect: (edge: Omit<DesignEdge, 'id'>) => void;
  removeEdge: (id: string) => void;

  clear: () => void;
  loadSample: () => void;

  applyFix: (fix: Fix) => boolean;
  applyAllFixes: (fixes: Fix[]) => number;
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
  applyBuildingLayout: (options?: { bedrooms?: number; engineering?: boolean; resetMap?: boolean }) => { ok: boolean; message: string; changes: number };
  duplicateRoom: (roomId: string) => void;
  addBedroomToLayout: (roomId?: string) => void;
  updateRoom: (id: string, patch: Partial<DesignRoom>) => void;
  moveRoom: (id: string, x: number, y: number) => void;
  resizeRoom: (id: string, width: number, height: number) => void;
  removeRoom: (id: string) => void;
  selectRoom: (id: string | null) => void;
  selectOpening: (id: string | null) => void;
  selectWall: (id: string | null) => void;
  updateWall: (id: string, patch: { lengthM?: number; thickness?: number; heightM?: number }) => void;
  assignOpeningToWall: (openingId: string, wallId: string, along?: number) => void;
  updateOpening: (id: string, patch: Partial<DesignOpening>) => void;
  moveOpening: (id: string, x: number, y: number) => void;
  removeOpening: (id: string) => void;
  setOpeningControl: (id: string, openPercent: number) => void;

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
  addFloor: (label?: string) => void;
  switchFloor: (floorId: string) => void;
  removeFloor: (floorId: string) => void;
  addGarden: (label?: string, x?: number, y?: number, width?: number, height?: number) => void;
  addOpening: (kind: 'door' | 'window', x?: number, y?: number) => void;
  applyHdlScene: (sceneId: HdlSceneId) => number;
  setMapOverlayMode: (mode: MapOverlayMode) => void;
  setEditingCableRoute: (cableId: string | null) => void;
  rerouteCable: (cableId: string) => void;
  rerouteAllCables: () => void;
  updateCableRoutePoints: (cableId: string, points: RoutePoint[]) => void;
  toggleCableRoutes3d: () => void;
  toggleOutletsOnMap: () => void;
  addOutletToRoom: (roomId: string, catalogId: OutletCatalogId) => void;
  placeRoomOutlets: (roomId?: string) => { added: number };
  placeRoomCables: (roomId?: string) => { added: number };
  removeOutletsInRoom: (roomId: string) => void;
  assignVrfToRoom: (roomId: string) => void;
  setRoomVrfIndoor: (roomId: string, catalogId: string) => void;
  placeVrfLayout: () => { added: number };
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

function defaultFloors(): DesignFloor[] {
  return [{ id: 'floor_0', label: 'Ground Floor', level: 0, elevationM: 0 }];
}

function normalizeFloors(floors?: DesignFloor[]): { floors: DesignFloor[]; activeFloorId: string } {
  const list = floors?.length ? floors : defaultFloors();
  return { floors: list, activeFloorId: list[0]!.id };
}

function floorLabelForLevel(level: number): string {
  if (level === 0) return 'Ground Floor';
  if (level === 1) return 'First Floor';
  if (level === 2) return 'Second Floor';
  if (level < 0) return `Basement ${Math.abs(level)}`;
  return `Floor ${level}`;
}

function matchesFloor<T extends { floorId?: string }>(item: T, activeFloorId: string): boolean {
  return !item.floorId || item.floorId === activeFloorId;
}

function initialMapOverlayMode(): MapOverlayMode {
  if (typeof window === 'undefined') return 'combined';
  const v = window.localStorage.getItem('studio.mapOverlay');
  if (v === 'plan' || v === 'cables' || v === 'pipes' || v === 'combined') return v;
  return 'combined';
}

function initialCableRoutes3d(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('studio.cableRoutes3d') !== '0';
}

function initialOutletsOnMap(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('studio.outletsOnMap') !== '0';
}

function withHistory(s: StudioState, patch: Partial<StudioState>): Partial<StudioState> {
  return {
    ...patch,
    historyPast: [...s.historyPast.slice(-(HISTORY_LIMIT - 1)), cloneDesignSnapshot(s)],
    historyFuture: [],
  };
}

function fixableFrom(s: StudioState): FixableState {
  return {
    locale: s.locale,
    project: s.project,
    nodes: s.nodes,
    edges: s.edges,
    controls: s.controls,
    rooms: s.rooms,
  };
}

function patchFromFix(s: StudioState, fix: Fix): Partial<StudioState> | null {
  const patch = applyFixPatch(fixableFrom(s), fix);
  if (!patch) return null;
  const merged = {
    ...fixableFrom(s),
    nodes: patch.nodes ?? s.nodes,
    edges: patch.edges ?? s.edges,
    controls: patch.controls ?? s.controls,
  };
  return {
    nodes: rerouteDesignCables(merged),
    edges: merged.edges,
    controls: merged.controls,
  };
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
  selectedOpeningId: null,
  selectedWallId: null,
  floorPlanTool: 'select',
  cloudProjectId: null,
  simEnergyKwh: 0,
  pendingMapImport: false,
  canvasViewMode: initialCanvasViewMode(),
  canvasFitSeq: 0,
  suppressCanvasFit: false,
  applyingFixes: false,
  visualizationMode: initialVisualizationMode(),
  experienceMode: initialExperienceMode(),
  assistantOpen: false,
  autonomousAssumptions: [],
  bim: null,
  floors: defaultFloors(),
  activeFloorId: 'floor_0',
  showLuxHeatmap: initialLuxHeatmap(),
  showLoadHeatmap: initialLoadHeatmap(),
  twinSessionId: null,
  twinConnected: false,
  mapOverlayMode: initialMapOverlayMode(),
  editingCableRouteId: null,
  showCableRoutes3d: initialCableRoutes3d(),
  showOutletsOnMap: initialOutletsOnMap(),
  historyPast: [],
  historyFuture: [],

  undo: () =>
    set((s) => {
      if (!s.historyPast.length) return s;
      const prev = s.historyPast[s.historyPast.length - 1]!;
      const current = cloneDesignSnapshot(s);
      return {
        ...s,
        ...prev,
        historyPast: s.historyPast.slice(0, -1),
        historyFuture: [current, ...s.historyFuture].slice(0, HISTORY_LIMIT),
        selectedNodeId: null,
        selectedRoomId: null,
        selectedOpeningId: null,
        selectedWallId: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.historyFuture.length) return s;
      const next = s.historyFuture[0]!;
      const current = cloneDesignSnapshot(s);
      return {
        ...s,
        ...next,
        historyFuture: s.historyFuture.slice(1),
        historyPast: [...s.historyPast, current].slice(-HISTORY_LIMIT),
        selectedNodeId: null,
        selectedRoomId: null,
        selectedOpeningId: null,
        selectedWallId: null,
      };
    }),

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
      params.conduitType = 'conduit';
      params.showOnMap = true;
    }
    const node: DesignNode = { id: uid('n'), catalogId, label: defaultLabel(entry, get().locale), x, y, floorId: get().activeFloorId, params };
    set((s) => {
      let nodes = [...s.nodes, node];
      if (entry.domain === 'cable') {
        nodes = nodes.map((n) => (n.id === node.id ? rerouteCableNode(n, nodes, s.edges, s.rooms) : n));
      }
      return withHistory(s, {
        nodes,
        selectedNodeId: node.id,
        controls: { ...s.controls, [node.id]: defaultControlState(entry) },
      });
    });
  },

  moveNode: (id, x, y) =>
    set((s) => {
      let nodes = s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n));
      nodes = nodes.map((n) =>
        getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, nodes, s.edges, s.rooms) : n,
      );
      return withHistory(s, { nodes });
    }),

  updateNodeLabel: (id, label) =>
    set((s) => withHistory(s, { nodes: s.nodes.map((n) => (n.id === id ? { ...n, label } : n)) })),

  replaceNodeCatalog: (id, catalogId) =>
    set((s) => {
      const entry = getCatalogEntry(catalogId);
      if (!entry) return s;
      return withHistory(s, {
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
      });
    }),

  updateNodeParam: (id, key, value) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) })),

  removeNode: (id) =>
    set((s) => {
      const controls = { ...s.controls };
      delete controls[id];
      return withHistory(s, {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        controls,
      });
    }),

  select: (id) => set({ selectedNodeId: id, selectedRoomId: null, selectedOpeningId: null, selectedWallId: null }),

  setControl: (id, key, value, channelIndex) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === id);
      const entry = node ? getCatalogEntry(node.catalogId) : undefined;
      if (
        entry &&
        (entry.domain === 'smarthome' || entry.domain === 'sensor') &&
        !isBusPowerAdequate(s.project, s.nodes)
      ) {
        return s;
      }

      let controls: Record<string, ControlState>;
      if (channelIndex != null && entry?.domain === 'smarthome' && entry.channels > 1) {
        const prev = s.controls[id] ?? {};
        const channels = [...(prev.channels ?? Array(entry.channels).fill(false))];
        channels[channelIndex] = typeof value === 'boolean' ? value : Boolean(value);
        controls = { ...s.controls, [id]: { ...prev, channels } };
      } else {
        controls = { ...s.controls, [id]: { ...s.controls[id], [key]: value } };
      }
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
      const bim = syncOpeningsFromControls(s.bim, controls);
      return { controls, telegrams, bim };
    }),

  connect: (edge) =>
    set((s) => {
      const exists = s.edges.some(
        (e) => e.source === edge.source && e.target === edge.target && e.sourceHandle === edge.sourceHandle && e.targetHandle === edge.targetHandle,
      );
      if (exists) return s;
      const edges = [...s.edges, { ...edge, id: uid('e') }];
      const cableIds = new Set(
        [edge.source, edge.target].filter((id) => getCatalogEntry(s.nodes.find((n) => n.id === id)?.catalogId ?? '')?.domain === 'cable'),
      );
      const nodes =
        cableIds.size > 0
          ? s.nodes.map((n) => (cableIds.has(n.id) ? rerouteCableNode(n, s.nodes, edges, s.rooms) : n))
          : s.nodes;
      return withHistory(s, { edges, nodes });
    }),

  removeEdge: (id) => set((s) => withHistory(s, { edges: s.edges.filter((e) => e.id !== id) })),

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
      floors: defaultFloors(),
      activeFloorId: 'floor_0',
      telegrams: [],
      floorPlanTool: 'select',
      cloudProjectId: null,
      pendingMapImport: false,
      historyPast: [],
      historyFuture: [],
    }),

  loadSample: () => {
    const { nodes, edges, name } = buildSampleDesign(get().locale);
    const controls: Record<string, ControlState> = {};
    for (const n of nodes) {
      const entry = getCatalogEntry(n.catalogId);
      if (entry) controls[n.id] = defaultControlState(entry);
    }
    set({ nodes, edges, designName: name, selectedNodeId: null, controls, historyPast: [], historyFuture: [] });
  },

  applyFix: (fix) => {
    const s = get();
    const designPatch = patchFromFix(s, fix);
    if (!designPatch) return false;
    set(withHistory(s, designPatch));
    return true;
  },

  applyAllFixes: (fixes) => {
    if (!fixes.length) return 0;
    const s = get();
    const { state: next, applied } = applyAllFixPatches(fixableFrom(s), fixes);
    if (!applied) return 0;
    set(
      withHistory(s, {
        nodes: next.nodes,
        edges: next.edges,
        controls: next.controls,
      }),
    );
    return applied;
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
    const rooms = s.rooms.length > 0 ? s.rooms : seedRoomsForBuilding(s.project.buildingType, s.project.bedrooms);
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
      return withHistory(s, {
        nodes: [...s.nodes, copy],
        selectedNodeId: copy.id,
        controls: { ...s.controls, [copy.id]: entry ? defaultControlState(entry) : {} },
      });
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
    const floors = buildFloorsFromCount(mergedProject.floorCount, mergedProject.buildingType);
    let rooms = s.rooms;
    if (rooms.length === 0 || options.generateDesign) {
      rooms = seedRoomsForProject(mergedProject);
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
      const placed = enhanceDesignPlacement(mergedProject, rooms, starter.nodes, starter.edges, s.locale);
      nodes = placed.nodes;
      edges = placed.edges;
      designName = starter.name;
      controls = {};
      for (const n of nodes) {
        const entry = getCatalogEntry(n.catalogId);
        if (entry) controls[n.id] = defaultControlState(entry);
      }
      controls = { ...controls, ...placed.controls };
    }

    let bim = s.bim;
    if (rooms.length > 0) {
      const pack = buildBimOpenings(rooms, mergedProject, s.locale, s.activeFloorId);
      bim = { walls: bim?.walls ?? [], openings: pack.bim.openings, gardens: bim?.gardens ?? [] };
      if (mergedProject.smartBuilding || options.generateDesign) {
        nodes = mergeOpeningActuators(nodes, pack.actuatorNodes);
        controls = { ...controls, ...pack.controls };
      }
    }

    set({
      project: mergedProject,
      floors,
      activeFloorId: floors[0]!.id,
      rooms,
      nodes,
      edges,
      controls,
      designName,
      map,
      bim,
      floorPlanTool,
      pendingMapImport,
      selectedNodeId: null,
      selectedRoomId: null,
      selectedOpeningId: null,
      selectedWallId: null,
      historyPast: [],
      historyFuture: [],
    });
  },

  reopenWizard: () => set((s) => ({ project: { ...s.project, setupComplete: false } })),

  setFloorPlanTool: (tool) => set({ floorPlanTool: tool }),

  addRoom: (room) => {
    const id = room.id ?? uid('room');
    const r: DesignRoom = {
      id,
      label: room.label,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      zone: room.zone,
      floorId: room.floorId ?? get().activeFloorId,
    };
    set((s) => withHistory(s, { rooms: [...s.rooms, r], selectedRoomId: id, selectedNodeId: null }));
  },

  addRoomTemplate: (label, zone, width, height) => {
    const offset = get().rooms.length * 24;
    get().addRoom({ label, zone, x: -120 + offset, y: -80 + offset, width, height });
  },

  seedDefaultRooms: () => {
    get().applyBuildingLayout({ engineering: false, resetMap: true });
  },

  applyBuildingLayout: (options) => {
    const s = get();
    const bt = s.project.buildingType;
    if (!isResidentialBuilding(bt)) {
      const project = s.project;
      const floors = buildFloorsFromCount(project.floorCount, project.buildingType);
      const rooms = seedRoomsForProject(project);
      set({ floors, activeFloorId: floors[0]!.id, rooms, selectedRoomId: null, historyPast: [], historyFuture: [] });
      return { ok: true, message: 'Default commercial layout applied.', changes: rooms.length };
    }
    const bedrooms = options?.bedrooms ?? s.project.bedrooms ?? defaultBedroomsForBuilding(bt);
    const project = { ...s.project, bedrooms };
    const floors = buildFloorsFromCount(project.floorCount, project.buildingType);
    const rooms = seedRoomsForProject(project);
    let map = s.map;
    if (options?.resetMap !== false && (!map || map.mode === 'blank')) {
      const { width, height } = floorPlanSizeForBuilding(bt);
      map = {
        src: blankFloorPlanDataUrl(width, height),
        width,
        height,
        x: -width / 2,
        y: -height / 2,
        opacity: 1,
        mode: 'blank',
      };
    }
    let bim = s.bim;
    const openingPack = buildBimOpenings(rooms, s.project, s.locale, s.activeFloorId);
    bim = {
      walls: bim?.walls ?? [],
      openings: openingPack.bim.openings,
      gardens: bim?.gardens ?? openingPack.bim.gardens,
    };
    if (bt === 'villa') {
      const g = villaGardenBounds();
      const gardens = bim?.gardens ?? [];
      const hasGarden = gardens.some((x) => x.label.toLowerCase().includes('garden') || x.label.toLowerCase().includes('terrace'));
      if (!hasGarden) {
        bim = {
          walls: bim?.walls ?? [],
          openings: bim?.openings ?? [],
          gardens: [
            ...gardens,
            { id: uid('garden'), label: 'Garden', x: g.x, y: g.y, width: g.width, height: g.height, floorId: s.activeFloorId },
          ],
        };
      }
    }
    let nodes = s.nodes;
    let edges = s.edges;
    let controls = s.controls;
    if (s.project.smartBuilding || options?.engineering) {
      nodes = mergeOpeningActuators(nodes, openingPack.actuatorNodes);
      controls = { ...controls, ...openingPack.controls };
    }
    if (options?.engineering) {
      const project = { ...s.project, bedrooms };
      const starter = buildStarterDesign(project, s.locale, rooms);
      const placed = enhanceDesignPlacement(project, rooms, starter.nodes, starter.edges, s.locale);
      nodes = placed.nodes;
      edges = placed.edges;
      controls = {};
      for (const n of nodes) {
        const entry = getCatalogEntry(n.catalogId);
        if (entry) controls[n.id] = defaultControlState(entry);
      }
      controls = { ...controls, ...placed.controls };
    }
    set({
      project: {
        ...s.project,
        bedrooms,
        floorPlanSource: map?.mode === 'blank' ? 'zero' : s.project.floorPlanSource,
      },
      floors,
      activeFloorId: floors[0]!.id,
      rooms,
      map,
      bim,
      nodes,
      edges,
      controls,
      selectedRoomId: null,
      selectedNodeId: null,
      selectedOpeningId: null,
      floorPlanTool: map ? 'select' : s.floorPlanTool,
      historyPast: [],
      historyFuture: [],
    });
    return {
      ok: true,
      message: `Layout applied: ${rooms.length} rooms, ${bedrooms} bedrooms.`,
      changes: rooms.length,
    };
  },

  duplicateRoom: (roomId) => {
    const src = get().rooms.find((r) => r.id === roomId);
    if (!src) return;
    get().addRoom({
      label: `${src.label} (copy)`,
      zone: src.zone,
      x: src.x + 36,
      y: src.y + 36,
      width: src.width,
      height: src.height,
      floorId: src.floorId,
    });
  },

  addBedroomToLayout: (roomId) => {
    const s = get();
    const bt = s.project.buildingType;
    if (!isResidentialBuilding(bt)) return;
    const { max } = bedroomRangeForBuilding(bt);
    const next = Math.min(max, (s.project.bedrooms ?? defaultBedroomsForBuilding(bt)) + 1);
    get().applyBuildingLayout({ bedrooms: next, engineering: false, resetMap: false });
    const bedroomsRooms = get().rooms.filter((r) => r.zone === 'bedroom');
    const picked = bedroomsRooms[bedroomsRooms.length - 1];
    if (picked) set({ selectedRoomId: picked.id });
  },

  updateRoom: (id, patch) =>
    set((s) => withHistory(s, { rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

  moveRoom: (id, x, y) =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === id);
      if (!room) return s;
      const dx = x - room.x;
      const dy = y - room.y;
      const rooms = s.rooms.map((r) => (r.id === id ? { ...r, x, y } : r));
      if (!s.bim) return withHistory(s, { rooms });
      const walls = mergeEffectiveWalls(s.bim, rooms, s.activeFloorId);
      const openings = resnapOpeningsForRoom(s.bim.openings, id, walls).map((o) =>
        o.roomId === id && !o.wallId ? { ...o, x: o.x + dx, y: o.y + dy } : o,
      );
      return withHistory(s, { rooms, bim: { ...s.bim, openings } });
    }),

  resizeRoom: (id, width, height) =>
    set((s) => {
      const rooms = s.rooms.map((r) =>
        r.id === id ? { ...r, width: Math.max(60, width), height: Math.max(50, height) } : r,
      );
      if (!s.bim) return withHistory(s, { rooms });
      const walls = mergeEffectiveWalls(s.bim, rooms, s.activeFloorId);
      const openings = resnapOpeningsForRoom(s.bim.openings, id, walls);
      return withHistory(s, { rooms, bim: { ...s.bim, openings } });
    }),

  removeRoom: (id) =>
    set((s) =>
      withHistory(s, {
        rooms: s.rooms.filter((r) => r.id !== id),
        selectedRoomId: s.selectedRoomId === id ? null : s.selectedRoomId,
      }),
    ),

  selectRoom: (id) => set({ selectedRoomId: id, selectedNodeId: null, selectedOpeningId: null, selectedWallId: null }),

  selectOpening: (id) => set({ selectedOpeningId: id, selectedNodeId: null, selectedRoomId: null, selectedWallId: null }),

  selectWall: (id) => set({ selectedWallId: id, selectedNodeId: null, selectedRoomId: null, selectedOpeningId: null }),

  updateWall: (id, patch) =>
    set((s) => {
      const walls = mergeEffectiveWalls(s.bim, s.rooms, s.activeFloorId);
      const wall = walls.find((w) => w.id === id);
      if (!wall) return s;

      if (isVirtualRoomWall(id) && wall.roomId && wall.edge) {
        const room = s.rooms.find((r) => r.id === wall.roomId);
        if (!room) return s;
        let rooms = s.rooms;
        if (patch.lengthM != null) {
          const lenPx = patch.lengthM * 50;
          const roomPatch = roomPatchForWallLength(wall, lenPx, room);
          if (roomPatch) {
            rooms = s.rooms.map((r) => (r.id === room.id ? { ...r, ...roomPatch } : r));
          }
        }
        const bim = s.bim ?? { walls: [], openings: [] };
        const wallMeta = { ...(bim.wallMeta ?? {}) };
        if (patch.thickness != null || patch.heightM != null) {
          wallMeta[id] = {
            ...wallMeta[id],
            ...(patch.thickness != null ? { thickness: patch.thickness } : {}),
            ...(patch.heightM != null ? { heightM: patch.heightM } : {}),
          };
        }
        const effWalls = mergeEffectiveWalls({ ...bim, wallMeta }, rooms, s.activeFloorId);
        const openings = room.id ? resnapOpeningsForRoom(bim.openings, room.id, effWalls) : bim.openings;
        return withHistory(s, { rooms, bim: { ...bim, wallMeta, openings } });
      }

      if (!s.bim) return s;
      let nextWalls = s.bim.walls;
      if (patch.lengthM != null) {
        const lenPx = patch.lengthM * 50;
        nextWalls = s.bim.walls.map((w) => (w.id === id ? setWallLength(w, lenPx) : w));
      }
      if (patch.thickness != null || patch.heightM != null) {
        nextWalls = nextWalls.map((w) =>
          w.id === id
            ? {
                ...w,
                ...(patch.thickness != null ? { thickness: patch.thickness } : {}),
                ...(patch.heightM != null ? { heightM: patch.heightM } : {}),
              }
            : w,
        );
      }
      const bim = { ...s.bim, walls: nextWalls };
      const effWalls = mergeEffectiveWalls(bim, s.rooms, s.activeFloorId);
      const target = effWalls.find((w) => w.id === id);
      const openings =
        target != null
          ? bim.openings.map((o) => (o.wallId === id ? orientOpeningOnWall(o, target, o.along ?? 0.5) : o))
          : bim.openings;
      return withHistory(s, { bim: { ...bim, openings } });
    }),

  assignOpeningToWall: (openingId, wallId, along = 0.5) =>
    set((s) => {
      if (!s.bim) return s;
      const walls = mergeEffectiveWalls(s.bim, s.rooms, s.activeFloorId);
      const wall = walls.find((w) => w.id === wallId);
      const opening = s.bim.openings.find((o) => o.id === openingId);
      if (!wall || !opening) return s;
      const next = orientOpeningOnWall(opening, wall, along);
      let nodes = s.nodes;
      if (next.linkedNodeId) {
        nodes = nodes.map((n) =>
          n.id === next.linkedNodeId ? { ...n, x: next.x - 28, y: next.y - 12, floorId: next.floorId } : n,
        );
      }
      return withHistory(s, {
        bim: { ...s.bim, openings: s.bim.openings.map((o) => (o.id === openingId ? next : o)) },
        nodes,
      });
    }),

  updateOpening: (id, patch) =>
    set((s) => {
      if (!s.bim) return s;
      return withHistory(s, {
        bim: {
          ...s.bim,
          openings: s.bim.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        },
      });
    }),

  moveOpening: (id, x, y) =>
    set((s) => {
      if (!s.bim) return s;
      const walls = mergeEffectiveWalls(s.bim, s.rooms, s.activeFloorId);
      const opening = s.bim.openings.find((o) => o.id === id);
      if (!opening) return s;
      const next = snapOpening(opening, walls, x, y);
      let nodes = s.nodes;
      if (next.linkedNodeId) {
        nodes = nodes.map((n) =>
          n.id === next.linkedNodeId ? { ...n, x: next.x + (opening.kind === 'door' ? 24 : -28), y: next.y + (opening.kind === 'door' ? 8 : -20) } : n,
        );
      }
      return withHistory(s, {
        bim: { ...s.bim, openings: s.bim.openings.map((o) => (o.id === id ? next : o)) },
        nodes,
      });
    }),

  removeOpening: (id) =>
    set((s) => {
      if (!s.bim) return s;
      const opening = s.bim.openings.find((o) => o.id === id);
      const linked = opening?.linkedNodeId;
      const controls = { ...s.controls };
      if (linked) delete controls[linked];
      return withHistory(s, {
        bim: { ...s.bim, openings: s.bim.openings.filter((o) => o.id !== id) },
        nodes: linked ? s.nodes.filter((n) => n.id !== linked) : s.nodes,
        controls,
        selectedOpeningId: s.selectedOpeningId === id ? null : s.selectedOpeningId,
      });
    }),

  setOpeningControl: (id, openPercent) => {
    const s = get();
    const opening = s.bim?.openings.find((o) => o.id === id);
    if (!opening) return;
    const pct = Math.max(0, Math.min(100, openPercent));
    if (opening.linkedNodeId) {
      if (opening.kind === 'window') get().setControl(opening.linkedNodeId, 'level', pct);
      else get().setControl(opening.linkedNodeId, 'on', pct >= 50);
    } else {
      set((st) => ({
        bim: st.bim
          ? { ...st.bim, openings: st.bim.openings.map((o) => (o.id === id ? { ...o, openPercent: pct } : o)) }
          : st.bim,
      }));
    }
  },

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
      floors: s.floors,
      activeFloorId: s.activeFloorId,
    };
  },

  loadDesign: (file) => {
    const { floors, activeFloorId } = normalizeFloors(file.floors);
    set({
      designName: file.designName ?? '',
      project: normalizeProject(file.project),
      rooms: (file.rooms ?? []).map((r) => ({ ...r, floorId: r.floorId ?? floors[0]!.id })),
      bim: file.bim ?? null,
      floors,
      activeFloorId: file.activeFloorId && floors.some((f) => f.id === file.activeFloorId) ? file.activeFloorId : activeFloorId,
      nodes: (file.nodes ?? []).map((n) => ({ ...n, floorId: n.floorId ?? floors[0]!.id })),
      edges: file.edges ?? [],
      controls: file.controls ?? {},
      map: file.map ?? null,
      selectedNodeId: null,
      selectedRoomId: null,
      telegrams: [],
      simulating: false,
      simEnergyKwh: 0,
      floorPlanTool: file.map?.mode === 'blank' ? 'draw-room' : 'select',
      historyPast: [],
      historyFuture: [],
    });
  },

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
    const busPowerOk = isBusPowerAdequate(s.project, s.nodes);
    const states = simulate(resolved, s.edges, s.controls, { busPowerOk });
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
      applyAllFixes: s.applyAllFixes,
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
    const placed = enhanceDesignPlacement(s.project, s.rooms, s.nodes, s.edges, s.locale);
    set((st) => ({
      nodes: placed.nodes,
      edges: placed.edges,
      controls: { ...st.controls, ...placed.controls },
    }));
    const added = placed.nodes.length - before;
    return {
      ok: true,
      message: `Engineering layout updated: ${added >= 0 ? added : 0} devices placed from lighting/HVAC calculations.`,
      changes: Math.max(0, added),
    };
  },

  addFloor: (label) => {
    const s = get();
    const level = s.floors.length ? Math.max(...s.floors.map((f) => f.level)) + 1 : 1;
    const floor: DesignFloor = {
      id: uid('floor'),
      label: label ?? floorLabelForLevel(level),
      level,
      elevationM: level * 3,
    };
    set({ floors: [...s.floors, floor], activeFloorId: floor.id });
  },

  switchFloor: (floorId) => set({ activeFloorId: floorId, selectedNodeId: null, selectedRoomId: null, selectedOpeningId: null, selectedWallId: null }),

  removeFloor: (floorId) =>
    set((s) => {
      if (s.floors.length <= 1) return s;
      const floors = s.floors.filter((f) => f.id !== floorId);
      const fallback = floors[0]!.id;
      return {
        floors,
        activeFloorId: s.activeFloorId === floorId ? fallback : s.activeFloorId,
        rooms: s.rooms.filter((r) => r.floorId !== floorId),
        nodes: s.nodes.filter((n) => n.floorId !== floorId),
        bim: s.bim
          ? {
              walls: s.bim.walls.filter((w) => w.floorId !== floorId),
              openings: s.bim.openings.filter((o) => o.floorId !== floorId),
              gardens: s.bim.gardens?.filter((g) => g.floorId !== floorId),
            }
          : null,
      };
    }),

  addGarden: (label = 'Garden', x = -400, y = 120, width = 240, height = 180) =>
    set((s) => {
      const garden: DesignGarden = {
        id: uid('garden'),
        label,
        x,
        y,
        width,
        height,
        floorId: s.activeFloorId,
      };
      const bim: BimModel = {
        walls: s.bim?.walls ?? [],
        openings: s.bim?.openings ?? [],
        gardens: [...(s.bim?.gardens ?? []), garden],
      };
      return { bim };
    }),

  addOpening: (kind, x, y) =>
    set((s) => {
      let cx = x;
      let cy = y;
      if (cx == null || cy == null) {
        const room = s.selectedRoomId ? s.rooms.find((r) => r.id === s.selectedRoomId) : undefined;
        if (room) {
          cx = room.x + room.width / 2;
          cy = kind === 'door' ? room.y + room.height : room.y + 8;
        } else if (s.map) {
          cx = s.map.x + s.map.width / 2;
          cy = s.map.y + s.map.height / 2;
        } else {
          cx = 0;
          cy = 0;
        }
      }
      const smart = s.project.smartBuilding;
      let opening: DesignOpening = {
        id: uid('open'),
        kind,
        x: cx,
        y: cy,
        width: kind === 'door' ? 76 : 96,
        height: kind === 'door' ? 18 : 16,
        floorId: s.activeFloorId,
        roomId: s.selectedRoomId ?? undefined,
        smartEnabled: smart,
        openPercent: 0,
        curtainStyle: kind === 'window' && smart ? 'single' : 'none',
      };
      const walls = mergeEffectiveWalls(s.bim, s.rooms, s.activeFloorId);
      opening = snapOpening(opening, walls, cx, cy);
      let nodes = s.nodes;
      let controls = { ...s.controls };
      if (smart) {
        const act = actuatorsForOpenings([opening], s.locale, s.activeFloorId);
        opening = act.openings[0]!;
        nodes = mergeOpeningActuators(nodes, act.nodes);
        for (const n of act.nodes) {
          const entry = getCatalogEntry(n.catalogId);
          if (entry) controls[n.id] = defaultControlState(entry);
        }
      }
      const bim: BimModel = {
        walls: s.bim?.walls ?? [],
        openings: [...(s.bim?.openings ?? []), opening],
        gardens: s.bim?.gardens,
      };
      return { bim, nodes, controls, selectedOpeningId: opening.id, selectedNodeId: null, selectedRoomId: null };
    }),

  applyHdlScene: (sceneId) => {
    const s = get();
    if (!isBusPowerAdequate(s.project, s.nodes)) return 0;
    if (!s.simulating) set({ simulating: true });
    const changes = runHdlScene(sceneId, s.nodes, (id, key, value) => get().setControl(id, key, value));
    const bim = syncOpeningsFromControls(s.bim, get().controls);
    if (bim !== s.bim) set({ bim });
    return changes;
  },

  setMapOverlayMode: (mode) => {
    persist('studio.mapOverlay', mode);
    set({ mapOverlayMode: mode });
  },

  setEditingCableRoute: (cableId) => set({ editingCableRouteId: cableId, selectedNodeId: cableId }),

  rerouteCable: (cableId) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === cableId ? rerouteCableNode(n, s.nodes, s.edges, s.rooms) : n)),
    })),

  rerouteAllCables: () =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, s.nodes, s.edges, s.rooms) : n,
      ),
    })),

  updateCableRoutePoints: (cableId, points) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== cableId) return n;
        const entry = getCatalogEntry(n.catalogId) as CableSpec | undefined;
        const params = applyRouteToCable(n, points, entry);
        return { ...n, label: String(params.cableLabel ?? n.label), params };
      }),
    })),

  toggleCableRoutes3d: () => {
    const next = !get().showCableRoutes3d;
    persist('studio.cableRoutes3d', next ? '1' : '0');
    set({ showCableRoutes3d: next });
  },

  toggleOutletsOnMap: () => {
    const next = !get().showOutletsOnMap;
    persist('studio.outletsOnMap', next ? '1' : '0');
    set({ showOutletsOnMap: next });
  },

  addOutletToRoom: (roomId, catalogId) => {
    const s = get();
    const room = s.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const entry = getCatalogEntry(catalogId);
    if (!entry) return;
    const pos = defaultPositionInRoom(room, catalogId);
    const node: DesignNode = {
      id: uid('outlet'),
      catalogId,
      label: `${room.label} ${entry.name[s.locale] ?? entry.name.en}`,
      x: pos.x,
      y: pos.y,
      floorId: room.floorId ?? s.activeFloorId,
      params: { roomId, showOnMap: true },
    };
    set((st) => ({
      nodes: [...st.nodes, node],
      selectedNodeId: node.id,
      controls: { ...st.controls, [node.id]: defaultControlState(entry) },
    }));
  },

  placeRoomOutlets: (roomId) => {
    const s = get();
    const targets = roomId ? s.rooms.filter((r) => r.id === roomId) : s.rooms;
    const sockets = placeSocketOutlets(targets);
    const appliances = placeAppliances(targets);
    const placed = [...sockets, ...appliances];
    const prefixFilter = (n: DesignNode) =>
      roomId
        ? n.id.startsWith(`outlet_${roomId}_`) || n.id.startsWith(`appliance_${roomId}_`)
        : n.id.startsWith('outlet_') || n.id.startsWith('appliance_');
    const kept = s.nodes.filter((n) => !prefixFilter(n));
    set({ nodes: [...kept, ...placed] });
    return { added: placed.length };
  },

  placeRoomCables: (roomId) => {
    const s = get();
    const panel =
      s.nodes.find((n) => n.id === 'panel_main') ??
      s.nodes.find((n) => n.catalogId === 'load-distribution-board');
    if (!panel) return { added: 0 };

    const targets = roomId ? s.rooms.filter((r) => r.id === roomId) : s.rooms;
    if (!targets.length) return { added: 0 };

    let nodes = [...s.nodes];
    let edges = [...s.edges];
    let added = 0;

    const loadsInRoom = (room: DesignRoom) =>
      nodes.filter((n) => {
        const e = getCatalogEntry(n.catalogId);
        if (!e) return false;
        if (e.domain === 'cable' || e.domain === 'protection' || e.domain === 'source') return false;
        if (e.domain !== 'load' && e.category !== 'SOCKET' && e.category !== 'APPLIANCE') return false;
        if (n.params.roomId === room.id) return true;
        const cx = n.x + 21;
        const cy = n.y + 21;
        return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
      });

    for (const room of targets) {
      const prefix = `cable_${room.id}`;
      const removeIds = new Set(
        nodes.filter((n) => n.id === prefix || n.id.startsWith(`${prefix}_`)).map((n) => n.id),
      );
      nodes = nodes.filter((n) => !removeIds.has(n.id));
      edges = edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target));

      const loads = loadsInRoom(room);
      if (!loads.length) continue;

      const before = nodes.length;
      wireRoomLoads(
        panel.id,
        room,
        loads,
        s.rooms,
        (src, sh, tgt, th) => ({ id: uid('e'), source: src, sourceHandle: sh, target: tgt, targetHandle: th }),
        (n) => {
          nodes.push(n);
        },
        (e) => {
          edges.push(e);
        },
      );
      added += nodes.length - before;
    }

    nodes = nodes.map((n) =>
      getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, nodes, edges, s.rooms) : n,
    );
    set({ nodes, edges });
    return { added };
  },

  removeOutletsInRoom: (roomId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => {
        const e = getCatalogEntry(n.catalogId);
        if (e?.category !== 'SOCKET' && e?.category !== 'APPLIANCE') return true;
        if (n.params.roomId === roomId) return false;
        if (n.id.startsWith(`outlet_${roomId}_`) || n.id.startsWith(`appliance_${roomId}_`)) return false;
        const room = s.rooms.find((r) => r.id === roomId);
        if (!room) return true;
        const cx = n.x + 21;
        const cy = n.y + 21;
        const inside = cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
        return !inside;
      }),
    })),

  assignVrfToRoom: (roomId) => {
    const s = get();
    const room = s.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const report = calculateVrfDistribution(s.rooms, s.project, s.nodes);
    const row = report.rooms.find((r) => r.roomId === roomId);
    if (!row) return;
    const without = s.nodes.filter(
      (n) => !(n.params.roomId === roomId && (getCatalogEntry(n.catalogId) as HvacSpec | undefined)?.hvacType === 'VRF_INDOOR'),
    );
    const added: DesignNode[] = [];
    let unitIdx = 0;
    for (const unit of row.indoorUnits) {
      for (let q = 0; q < unit.qty; q++) {
        const pos = indoorPositionInRoom(room, unit.style, unitIdx);
        added.push({
          id: uid('hvac_vrf'),
          catalogId: unit.catalogId,
          label: `${room.label} VRF ${unit.style}`,
          x: pos.x,
          y: pos.y,
          floorId: room.floorId ?? s.activeFloorId,
          params: {
            roomId,
            vrfGroupId: row.outdoorGroupId,
            vrfRole: 'indoor',
            branchAddress: row.branchAddress,
            showOnMap: true,
          },
        });
        unitIdx++;
      }
    }
    set({ nodes: [...without, ...added], selectedNodeId: added[0]?.id ?? null });
  },

  setRoomVrfIndoor: (roomId, catalogId) => {
    const s = get();
    const room = s.rooms.find((r) => r.id === roomId);
    const entry = getCatalogEntry(catalogId) as HvacSpec | undefined;
    if (!room || entry?.hvacType !== 'VRF_INDOOR') return;
    const report = calculateVrfDistribution(s.rooms, s.project, s.nodes);
    const row = report.rooms.find((r) => r.roomId === roomId);
    const pos = indoorPositionInRoom(room, entry.vrfIndoorStyle ?? 'wall', 0);
    const without = s.nodes.filter(
      (n) => !(n.params.roomId === roomId && (getCatalogEntry(n.catalogId) as HvacSpec | undefined)?.hvacType === 'VRF_INDOOR'),
    );
    const node: DesignNode = {
      id: uid('hvac_vrf'),
      catalogId,
      label: `${room.label} VRF`,
      x: pos.x,
      y: pos.y,
      floorId: room.floorId ?? s.activeFloorId,
      params: {
        roomId,
        vrfGroupId: row?.outdoorGroupId ?? 'vrf_odu_0',
        vrfRole: 'indoor',
        branchAddress: row?.branchAddress ?? 'ODU.1',
        showOnMap: true,
      },
    };
    set({ nodes: [...without, node], selectedNodeId: node.id });
  },

  placeVrfLayout: () => {
    const s = get();
    const placed = placeVrfDistribution(s.rooms, s.project);
    const filtered = s.nodes.filter((n) => {
      const e = getCatalogEntry(n.catalogId) as HvacSpec | undefined;
      return !n.id.startsWith('hvac_vrf_') && e?.hvacType !== 'VRF_INDOOR' && e?.hvacType !== 'VRF_OUTDOOR';
    });
    set({ nodes: [...filtered, ...placed] });
    return { added: placed.length };
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
        floors: s.floors,
        activeFloorId: s.activeFloorId,
      };
      try {
        window.localStorage.setItem('studio.design', JSON.stringify(file));
      } catch {
        /* quota / serialization issues ignored */
      }
    }, 700);
  });
}

function collectIssues(st: Pick<StudioState, 'nodes' | 'edges' | 'rooms' | 'project' | 'activeFloorId'>): Issue[] {
  const resolved = resolveNodes(st.nodes, getCatalogEntry);
  const activeRooms = st.rooms.filter((r) => matchesFloor(r, st.activeFloorId));
  const activeNodes = resolved.filter((n) => matchesFloor(n, st.activeFloorId));
  const { issues: eng } = validateDesign(activeNodes, st.edges, CABLES as CableSpec[]);
  const place = validatePlacement(st.nodes.filter((n) => matchesFloor(n, st.activeFloorId)), activeRooms, getCatalogEntry);
  const lighting = validateLightingDesign(activeNodes, activeRooms);
  const smart = suggestSmartFixes(st.project, st.nodes, st.edges, activeRooms);
  return [...eng, ...place, ...lighting, ...smart];
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
