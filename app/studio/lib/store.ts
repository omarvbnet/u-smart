'use client';

import { create } from 'zustand';
import { CATALOG, getCatalogEntry, type CatalogEntry } from './catalog';
import type { DesignNode, DesignEdge, DesignRoom, BimModel, DesignFloor, DesignGarden, DesignOpening } from './model';
import { normalizeBim } from './model';
import { resolveNodes } from './model';
import type { Fix, Issue } from './engine/validation';
import { validateDesign } from './engine/validation';
import { validatePlacement } from './engine/placement-validation';
import {
  applyFixPatch,
  mergeFixableState,
  collectFixableFixes,
  prioritizeFixes,
  applyFixChunk,
  FIX_APPLY_BATCH,
  finalizeFixableState,
  fixKey,
  type FixableState,
} from './engine/apply-fix';
import { translateNodesForRoomMove, nodeBelongsToRoom } from './engine/room-move';
import { runWhenIdle, runAsyncWhenIdle, yieldToMain } from './idle';
import { isBulkGeneration } from './engine/bulk-generation';
import { CABLES } from './catalog/cables';
import type { CableSpec } from './catalog';
import { STUDIO_LOCALES, type StudioLocale } from './i18n';
import { buildSampleDesign } from './sample';
import { defaultControlState, type ControlState } from './controls';
import { assignAddresses, makeTelegram, type Telegram } from './engine/bus';
import { defaultProject, normalizeProject, isManualDesign, type ProjectInfo, type FloorPlanSource, type DesignMode } from './project';
import { blankFloorPlanDataUrl, floorPlanSizeForBuilding } from './blank-floor-plan';
import { buildStarterDesign, enhanceDesignPlacement, enhanceDesignPlacementAsync, generateProjectDesignAsync } from './engine/starter-design';
import { inferFinishMetaFromPlan } from './engine/plan-layout';
import { withIraqElectricalStandards } from './engine/iraq-electrical';
import { parseTwin3dSpaceId } from './engine/twin3d-spaces';
import { invalidateDesignAnalysisCache } from './design-analysis';
import {
  seedRoomsForBuilding,
  isResidentialBuilding,
  defaultBedroomsForBuilding,
  bedroomRangeForBuilding,
  villaGardenBounds,
} from './engine/residential-layouts';
import { buildFloorsFromCount, seedRoomsForProject } from './engine/floor-layout';
import { analyzeImportedMap, fallbackRoomsForMap } from './map-import-analyze';
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
import { rerouteCableNode, parseRoutePoints, computeCableRoute, applyRouteToCable, cableIdsLinkedToNode, type RoutePoint } from './engine/cable-map';
import { attachRoomElectricalDistribution, attachRoomElectricalDistributionAsync } from './engine/room-electrical-distribution';
import { placeRoomControls } from './engine/room-controls-layout';
import { calculateLightingDesign } from './engine/lighting-design';
import { placeSmartChannelSystem } from './engine/smart-channel-layout';
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
  isUserDrawnWall,
  translateWall,
} from './engine/wall-layout';
import { defaultWallColor } from './wall-finishes';
import type { VisualizationMode, ExperienceMode } from './visualization/modes';
import { cloneDesignSnapshot, HISTORY_LIMIT } from './history';

export type Theme = 'dark' | 'light';
export type FloorPlanTool = 'select' | 'draw-room' | 'draw-wall' | 'place-door' | 'place-window';
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

export type MapImportPhase =
  | 'idle'
  | 'reading'
  | 'detecting-rooms'
  | 'detecting-walls'
  | 'generating'
  | 'done'
  | 'error';

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
  /** Wizard chose generate after the plan file is analyzed. */
  pendingGenerateAfterImport: boolean;
  mapImportPhase: MapImportPhase;
  mapImportDetail: string | null;
  canvasViewMode: CanvasViewMode;
  canvasFitSeq: number;
  suppressCanvasFit: boolean;
  applyingFixes: boolean;
  fixBatchResult: { applied: number; remaining: number } | null;
  generatingProject: boolean;
  /** Delays mounting the heavy canvas until after the first paint following bulk generation. */
  canvasBooting: boolean;
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
  showSpaceDimensions: boolean;
  /** When set, 3D twin isolates one room or garden (`garden:id`). */
  twin3dFocusSpaceId: string | null;
  twin3dShowMaterials: boolean;
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
  applyAllFixes: (fixes?: Fix[]) => boolean;
  toggleSimulation: () => void;

  setMap: (src: string, width: number, height: number, bim?: BimModel | null) => void;
  importMapAndAnalyze: (file: File, opts?: { generateAfter?: boolean }) => Promise<{ rooms: number; walls: number }>;
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
    options: {
      generateDesign: boolean;
      floorPlan: FloorPlanSource | 'skip';
      roomDistribution?: 'perFloor' | 'groundOnly';
      manualMode?: boolean;
      importFile?: File;
    },
  ) => void;
  reopenWizard: () => void;

  setFloorPlanTool: (tool: FloorPlanTool) => void;
  addRoom: (room: Omit<DesignRoom, 'id'> & { id?: string }) => void;
  addRoomTemplate: (
    label: string,
    zone: DesignRoom['zone'],
    width: number,
    height: number,
    spaceKind?: DesignRoom['spaceKind'],
  ) => void;
  seedDefaultRooms: () => void;
  applyBuildingLayout: (options?: { bedrooms?: number; engineering?: boolean; resetMap?: boolean }) => { ok: boolean; message: string; changes: number };
  duplicateRoom: (roomId: string) => void;
  addBedroomToLayout: (roomId?: string) => void;
  updateRoom: (id: string, patch: Partial<DesignRoom>) => void;
  assignRoomToFloor: (roomId: string, floorId: string) => void;
  moveRoom: (id: string, x: number, y: number) => void;
  resizeRoom: (id: string, width: number, height: number) => void;
  removeRoom: (id: string) => void;
  selectRoom: (id: string | null) => void;
  selectOpening: (id: string | null) => void;
  selectWall: (id: string | null) => void;
  moveWall: (id: string, x1: number, y1: number) => void;
  removeWall: (id: string) => void;
  addWall: (x1: number, y1: number, x2: number, y2: number) => void;
  updateWall: (
    id: string,
    patch: {
      lengthM?: number;
      thickness?: number;
      heightM?: number;
      wallType?: import('./model').DesignWall['wallType'];
      decoration?: import('./model').DesignWall['decoration'];
      color?: string;
    },
  ) => void;
  updateRoomCeiling: (
    roomId: string,
    patch: {
      ceilingType?: import('./wall-finishes').CeilingType;
      decoration?: import('./wall-finishes').CeilingDecoration;
      color?: string;
    },
  ) => void;
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
  toggleSpaceDimensions: () => void;
  setTwin3dFocusSpace: (spaceId: string | null) => void;
  setTwin3dShowMaterials: (show: boolean) => void;
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

const CABLE_REROUTE_BATCH = 30;
const NODE_APPLY_BATCH = 72;

type DeferredDesignWork = {
  deferredElectrical?: boolean;
  deferredSmart?: boolean;
  deferredRoomControls?: boolean;
  deferredFloorPlacement?: boolean;
};

function deferredWorkFromResult(result: {
  deferredElectrical?: boolean;
  deferredSmart?: boolean;
  deferredRoomControls?: boolean;
  deferredFloorPlacement?: boolean;
}): DeferredDesignWork {
  return {
    deferredElectrical: result.deferredElectrical,
    deferredSmart: result.deferredSmart,
    deferredRoomControls: result.deferredRoomControls,
    deferredFloorPlacement: result.deferredFloorPlacement,
  };
}

function waitForCanvasBoot(get: () => StudioState): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!get().canvasBooting) return Promise.resolve();
  return new Promise((resolve) => {
    const tick = () => {
      if (!get().canvasBooting) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

async function runDeferredProjectWork(
  get: () => StudioState,
  set: (patch: Partial<StudioState>) => void,
  deferred?: DeferredDesignWork,
): Promise<void> {
  await waitForCanvasBoot(get);
  let s = get();
  if (!s.project.setupComplete || s.generatingProject) return;

  if (deferred?.deferredFloorPlacement) {
    const otherRooms = s.rooms.filter((r) => (r.floorId ?? 'floor_0') !== s.activeFloorId);
    if (otherRooms.length) {
      const proj = withIraqElectricalStandards(s.project);
      const expanded = await enhanceDesignPlacementAsync(proj, otherRooms, s.nodes, s.edges, s.locale, {
        deferCableRouting: true,
        initialBoot: true,
        skipSmartChannels: true,
        skipRoomControls: true,
      });
      set({ nodes: expanded.nodes, edges: expanded.edges, controls: { ...s.controls, ...expanded.controls } });
      await yieldToMain();
      s = get();
    }
  }

  if (deferred?.deferredSmart && s.project.smartBuilding && s.project.smartProtocol) {
    const proj = withIraqElectricalStandards(s.project);
    const smart = placeSmartChannelSystem(proj, s.rooms, s.nodes, s.edges, s.locale);
    set({ nodes: smart.nodes, edges: smart.edges, controls: { ...s.controls, ...smart.controls } });
    await yieldToMain();
    s = get();
  }

  if (deferred?.deferredRoomControls) {
    const proj = withIraqElectricalStandards(s.project);
    const lightingReport = calculateLightingDesign(s.rooms);
    const roomControls = placeRoomControls(proj, s.rooms, s.nodes, s.edges, s.locale, lightingReport);
    set({
      nodes: roomControls.nodes,
      edges: roomControls.edges,
      controls: { ...s.controls, ...roomControls.controls },
    });
    await yieldToMain();
    s = get();
  }

  if (deferred?.deferredElectrical) {
    const proj = withIraqElectricalStandards(s.project);
    const wired = await attachRoomElectricalDistributionAsync(proj, s.rooms, s.nodes, s.edges, {
      deferCableRouting: true,
    });
    set({ nodes: wired.nodes, edges: wired.edges });
  }

  scheduleDeferredCableReroute(get, set);
}

function scheduleDeferredProjectWork(
  get: () => StudioState,
  set: (patch: Partial<StudioState>) => void,
  deferred?: DeferredDesignWork,
): void {
  if (typeof window === 'undefined') return;
  runWhenIdle(() => {
    void runDeferredProjectWork(get, set, deferred);
  });
}

/** Spread cable geometry work across idle frames so project creation stays responsive. */
function scheduleDeferredCableReroute(
  getState: () => StudioState,
  setState: (patch: Partial<StudioState>) => void,
  opts?: { clearApplyingFixes?: boolean; onComplete?: () => void },
): void {
  if (typeof window === 'undefined') {
    opts?.onComplete?.();
    return;
  }
  const run = () => {
    const s = getState();
    if (!s.project.setupComplete || s.generatingProject) {
      if (opts?.clearApplyingFixes) setState({ applyingFixes: false, suppressCanvasFit: false });
      opts?.onComplete?.();
      return;
    }
    const cableIds = s.nodes.filter((n) => getCatalogEntry(n.catalogId)?.domain === 'cable').map((n) => n.id);
    if (!cableIds.length) {
      if (opts?.clearApplyingFixes) setState({ applyingFixes: false, suppressCanvasFit: false });
      invalidateDesignAnalysisCache();
      opts?.onComplete?.();
      return;
    }

    let index = 0;
    let working = s.nodes;

    const step = () => {
      const batch = cableIds.slice(index, index + CABLE_REROUTE_BATCH);
      if (!batch.length) {
        setState({
          nodes: working,
          ...(opts?.clearApplyingFixes ? { applyingFixes: false, suppressCanvasFit: false } : {}),
        });
        invalidateDesignAnalysisCache();
        opts?.onComplete?.();
        return;
      }
      const batchSet = new Set(batch);
      const edges = getState().edges;
      const rooms = getState().rooms;
      const nodeById = new Map(working.map((n) => [n.id, n]));
      working = working.map((n) => {
        if (!batchSet.has(n.id)) return n;
        const entry = getCatalogEntry(n.catalogId);
        if (entry?.domain !== 'cable') return n;
        const points = computeCableRoute(n, working, edges, rooms, nodeById);
        const params = applyRouteToCable(n, points, entry as CableSpec);
        return { ...n, label: String(params.cableLabel ?? n.label), params };
      });
      index += batch.length;
      if (index < cableIds.length) {
        window.requestAnimationFrame(step);
      } else {
        setState({
          nodes: working,
          ...(opts?.clearApplyingFixes ? { applyingFixes: false, suppressCanvasFit: false } : {}),
        });
        invalidateDesignAnalysisCache();
        opts?.onComplete?.();
      }
    };

    window.requestAnimationFrame(step);
  };

  runWhenIdle(run);
}

let fixJobSeq = 0;
const FIX_ALL_CAP = 2000;

/** Re-validate and apply fixes in batches — keeps the canvas responsive. */
function scheduleDeferredApplyAllFixes(
  getState: () => StudioState,
  setState: (patch: Partial<StudioState>) => void,
  seedFixes?: Fix[],
): void {
  const jobId = ++fixJobSeq;
  setState({ applyingFixes: true, fixBatchResult: null, suppressCanvasFit: true });
  invalidateDesignAnalysisCache();

  if (typeof window === 'undefined') {
    setState({ applyingFixes: false, suppressCanvasFit: false });
    return;
  }

  window.requestAnimationFrame(() => {
    if (jobId !== fixJobSeq) return;
    const preFix = getState();
    let state = fixableFrom(preFix);
    let totalApplied = 0;
    const skipped = new Set<string>();
    const affectedCables = new Set<string>();
    let pendingSeed = seedFixes?.length ? prioritizeFixes(seedFixes) : null;

    const nextFixes = (): Fix[] => {
      const list = pendingSeed ?? collectFixableFixes(state);
      pendingSeed = null;
      return prioritizeFixes(list).filter((f) => !skipped.has(fixKey(f)));
    };

    const commitResult = (remaining: number) => {
      if (jobId !== fixJobSeq) return;
      state = finalizeFixableState(state, affectedCables.size > 0 ? affectedCables : undefined);
      setState({
        nodes: state.nodes,
        edges: state.edges,
        controls: state.controls,
        applyingFixes: false,
        suppressCanvasFit: false,
        fixBatchResult: { applied: totalApplied, remaining },
      });
      invalidateDesignAnalysisCache();
      runWhenIdle(() => {
        if (jobId !== fixJobSeq) return;
        const cur = getState();
        setState({
          historyPast: [...cur.historyPast.slice(-(HISTORY_LIMIT - 1)), cloneDesignSnapshot(preFix)],
          historyFuture: [],
        });
      });
      if (affectedCables.size > 0) scheduleDeferredCableReroute(getState, setState);
    };

    const processBatch = () => {
      if (jobId !== fixJobSeq) return;
      if (totalApplied >= FIX_ALL_CAP) {
        const remaining = collectFixableFixes({ ...state, activeFloorId: getState().activeFloorId }).length;
        commitResult(remaining);
        return;
      }

      const fixes = nextFixes();
      const chunk = fixes.slice(0, FIX_APPLY_BATCH);
      if (!chunk.length) {
        const remaining = collectFixableFixes({ ...state, activeFloorId: getState().activeFloorId }).length;
        commitResult(remaining);
        return;
      }

      const { state: next, applied, affectedCables: aff } = applyFixChunk(state, chunk);
      if (!applied) {
        for (const f of chunk) skipped.add(fixKey(f));
      } else {
        state = next;
        totalApplied += applied;
        for (const id of aff) affectedCables.add(id);
      }
      window.requestAnimationFrame(processBatch);
    };

    window.requestAnimationFrame(processBatch);
  });
}

function persist(key: string, value: string) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}

function readStoredLocale(): StudioLocale | null {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem('studio.locale');
  if (saved && (STUDIO_LOCALES as readonly string[]).includes(saved)) return saved as StudioLocale;
  return null;
}

/** Stable defaults for SSR and the first client paint — prefs load in hydrate(). */
function initialLocale(): StudioLocale {
  return 'ar';
}

function initialTheme(): Theme {
  return 'dark';
}

function initialCanvasViewMode(): CanvasViewMode {
  return 'content';
}

function initialVisualizationMode(): VisualizationMode {
  return 'engineering';
}

function initialExperienceMode(): ExperienceMode {
  return 'engineer';
}

function initialLuxHeatmap(): boolean {
  return false;
}

function initialLoadHeatmap(): boolean {
  return false;
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
  return 'combined';
}

function initialCableRoutes3d(): boolean {
  return true;
}

function initialOutletsOnMap(): boolean {
  return true;
}

function initialSpaceDimensions(): boolean {
  return true;
}

function readUiPreferences(): Partial<StudioState> {
  if (typeof window === 'undefined') return {};
  const prefs: Partial<StudioState> = {};
  const locale = readStoredLocale();
  if (locale) prefs.locale = locale;
  const theme = window.localStorage.getItem('studio.theme');
  if (theme === 'light' || theme === 'dark') prefs.theme = theme;
  const canvasViewMode = window.localStorage.getItem('studio.canvasViewMode');
  if (canvasViewMode === 'full' || canvasViewMode === 'content') prefs.canvasViewMode = canvasViewMode;
  const visualizationMode = window.localStorage.getItem('studio.visualizationMode');
  if (visualizationMode === 'product' || visualizationMode === '3d' || visualizationMode === 'engineering') {
    prefs.visualizationMode = visualizationMode;
  }
  const experienceMode = window.localStorage.getItem('studio.experienceMode');
  if (experienceMode === 'client' || experienceMode === 'engineer') prefs.experienceMode = experienceMode;
  if (window.localStorage.getItem('studio.luxHeatmap') === '1') prefs.showLuxHeatmap = true;
  if (window.localStorage.getItem('studio.loadHeatmap') === '1') prefs.showLoadHeatmap = true;
  const mapOverlay = window.localStorage.getItem('studio.mapOverlay');
  if (mapOverlay === 'plan' || mapOverlay === 'cables' || mapOverlay === 'pipes' || mapOverlay === 'combined') {
    prefs.mapOverlayMode = mapOverlay;
  }
  if (window.localStorage.getItem('studio.cableRoutes3d') === '0') prefs.showCableRoutes3d = false;
  if (window.localStorage.getItem('studio.outletsOnMap') === '0') prefs.showOutletsOnMap = false;
  if (window.localStorage.getItem('studio.spaceDimensions') === '0') prefs.showSpaceDimensions = false;
  return prefs;
}

function withHistory(s: StudioState, patch: Partial<StudioState>): Partial<StudioState> {
  return {
    ...patch,
    historyPast: [...s.historyPast.slice(-(HISTORY_LIMIT - 1)), cloneDesignSnapshot(s)],
    historyFuture: [],
  };
}

/** Commit a generated design in batches so the canvas can paint between chunks. */
async function finalizeProjectGeneration(
  get: () => StudioState,
  set: (patch: Partial<StudioState>) => void,
  pre: StudioState,
  patch: Partial<StudioState>,
  deferred?: DeferredDesignWork,
): Promise<void> {
  const fullNodes = patch.nodes ?? [];
  const fullEdges = patch.edges ?? [];
  const fullControls = patch.controls ?? {};
  const nodeCount = fullNodes.length;
  const heavy = nodeCount > 120 || isBulkGeneration(patch.rooms ?? pre.rooms);

  const shell: Partial<StudioState> = {
    ...patch,
    nodes: [],
    edges: [],
    controls: {},
    generatingProject: false,
    suppressCanvasFit: false,
    canvasBooting: heavy,
    canvasFitSeq: pre.canvasFitSeq + 1,
    ...(heavy ? { mapOverlayMode: 'plan' as MapOverlayMode, showOutletsOnMap: false } : {}),
  };

  set(pre.historyPast.length === 0 ? shell : withHistory(pre, shell));
  await yieldToMain();

  if (!nodeCount) {
    set({ canvasBooting: false });
    scheduleDeferredProjectWork(get, set, deferred);
    return;
  }

  const batchSize = heavy ? NODE_APPLY_BATCH : nodeCount;
  for (let i = 0; i < nodeCount; i += batchSize) {
    const end = Math.min(nodeCount, i + batchSize);
    const nodes = fullNodes.slice(0, end);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges =
      end >= nodeCount ? fullEdges : fullEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    const controls: Record<string, ControlState> = {};
    for (const n of nodes) {
      const c = fullControls[n.id];
      if (c) controls[n.id] = c;
    }
    set({ nodes, edges, controls });
    await yieldToMain();
  }

  if (heavy) {
    await yieldToMain();
    runWhenIdle(() => set({ canvasBooting: false, showOutletsOnMap: true }));
  } else {
    set({ canvasBooting: false });
  }

  scheduleDeferredProjectWork(get, set, deferred);
}

function fixableFrom(s: StudioState): FixableState {
  return {
    locale: s.locale,
    project: s.project,
    nodes: s.nodes,
    edges: s.edges,
    controls: s.controls,
    rooms: s.rooms,
    activeFloorId: s.activeFloorId,
  };
}

function patchFromFix(s: StudioState, fix: Fix): Partial<StudioState> | null {
  const base = fixableFrom(s);
  const patch = applyFixPatch(base, fix);
  if (!patch) return null;
  const merged = mergeFixableState(base, patch);
  const affected = new Set<string>();
  if (fix.kind === 'resizeCable') affected.add(fix.nodeId);
  if (fix.kind === 'addCircuit') {
    for (const n of patch.nodes ?? []) {
      if (getCatalogEntry(n.catalogId)?.domain === 'cable') affected.add(n.id);
    }
  }
  if (fix.kind === 'moveNode') {
    for (const id of cableIdsLinkedToNode(fix.nodeId, merged.nodes, merged.edges)) affected.add(id);
  }
  const finalized = finalizeFixableState(merged, affected.size > 0 ? affected : undefined);
  return {
    nodes: finalized.nodes,
    edges: finalized.edges,
    controls: finalized.controls,
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
  pendingGenerateAfterImport: false,
  mapImportPhase: 'idle' as MapImportPhase,
  mapImportDetail: null,
  canvasViewMode: initialCanvasViewMode(),
  canvasFitSeq: 0,
  suppressCanvasFit: false,
  applyingFixes: false,
  fixBatchResult: null,
  generatingProject: false,
  canvasBooting: false,
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
  showSpaceDimensions: initialSpaceDimensions(),
  twin3dFocusSpaceId: null,
  twin3dShowMaterials: true,
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
      const cableIds = cableIdsLinkedToNode(id, nodes, s.edges);
      if (cableIds.size > 0) {
        nodes = nodes.map((n) =>
          cableIds.has(n.id) ? rerouteCableNode(n, nodes, s.edges, s.rooms) : n,
        );
      }
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
      pendingGenerateAfterImport: false,
      mapImportPhase: 'idle',
      mapImportDetail: null,
      generatingProject: false,
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
    invalidateDesignAnalysisCache();
    set(withHistory(s, designPatch));
    return true;
  },

  applyAllFixes: (fixes) => {
    if (get().applyingFixes) return false;
    scheduleDeferredApplyAllFixes(get, set, fixes);
    return true;
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

  importMapAndAnalyze: async (file, opts) => {
    const { importMapFile } = await import('./import-map');
    const s0 = get();
    const generateAfter = opts?.generateAfter ?? s0.pendingGenerateAfterImport;
    const locale = s0.locale;
    const activeFloorId = s0.activeFloorId;
    const project = { ...s0.project, floorPlanSource: 'import' as FloorPlanSource };

    set({
      mapImportPhase: 'reading',
      mapImportDetail: file.name,
      generatingProject: true,
      suppressCanvasFit: true,
      pendingGenerateAfterImport: false,
      selectedRoomId: null,
      selectedNodeId: null,
    });
    invalidateDesignAnalysisCache();

    let mapX = 0;
    let mapY = 0;
    let mapWidth = 0;
    let mapHeight = 0;
    let mapSrc = '';

    try {
      const { src, width, height, bim: cadBim } = await importMapFile(file);
      await yieldToMain();

      mapX = -width / 2;
      mapY = -height / 2;
      mapWidth = width;
      mapHeight = height;
      mapSrc = src;

      const mapBg = { src, width, height, x: mapX, y: mapY, opacity: 0.85, mode: 'image' as const };

      set({
        map: mapBg,
        project,
      });

      const { rooms: detectedRooms, bim } = await analyzeImportedMap(
        { src, width, height, mapX, mapY, activeFloorId, cadBim },
        (phase) => set({ mapImportPhase: phase }),
      );

      const rooms =
        detectedRooms.length > 0
          ? detectedRooms
          : fallbackRoomsForMap(mapX, mapY, width, height, activeFloorId, bim);

      const pre = get();

      if (generateAfter) {
        set({ mapImportPhase: 'generating' });
        const result = await generateProjectDesignAsync(project, rooms, locale, activeFloorId);
        invalidateDesignAnalysisCache();
        const mergedBim: BimModel = {
          walls: bim.walls,
          openings: [...bim.openings, ...(result.bim?.openings ?? [])],
          gardens: bim.gardens,
        };
        await finalizeProjectGeneration(
          get,
          set,
          pre,
          {
            project,
            map: mapBg,
            rooms,
            nodes: result.nodes,
            edges: result.edges,
            controls: result.controls,
            designName: result.designName,
            bim: mergedBim,
            selectedNodeId: null,
            selectedRoomId: null,
            selectedOpeningId: null,
            selectedWallId: null,
            canvasFitSeq: pre.canvasFitSeq + 1,
          },
          deferredWorkFromResult(result as Parameters<typeof deferredWorkFromResult>[0]),
        );
      } else {
        let nodes: DesignNode[] = [];
        let edges: DesignEdge[] = [];
        let controls: Record<string, ControlState> = {};
        let mergedBim = bim;
        if (rooms.length > 0 && project.smartBuilding) {
          const pack = buildBimOpenings(rooms, project, locale, activeFloorId);
          mergedBim = { walls: bim.walls, openings: [...bim.openings, ...pack.bim.openings], gardens: bim.gardens };
          nodes = mergeOpeningActuators(nodes, pack.actuatorNodes);
          controls = { ...controls, ...pack.controls };
        } else if (rooms.length > 0) {
          const pack = buildBimOpenings(rooms, project, locale, activeFloorId);
          mergedBim = { walls: bim.walls, openings: [...bim.openings, ...pack.bim.openings], gardens: bim.gardens };
        }
        await finalizeProjectGeneration(get, set, pre, {
          project,
          map: mapBg,
          rooms,
          bim: mergedBim,
          nodes,
          edges,
          controls,
          selectedNodeId: null,
          selectedRoomId: null,
          selectedOpeningId: null,
          selectedWallId: null,
          canvasFitSeq: pre.canvasFitSeq + 1,
        });
      }

      set({ mapImportPhase: 'done' });
      invalidateDesignAnalysisCache();
      return { rooms: rooms.length, walls: get().bim?.walls.length ?? 0 };
    } catch (err) {
      console.error('[U Smart Studio] map analysis failed', err);
      set({
        mapImportPhase: 'error',
        mapImportDetail: err instanceof Error ? err.message : 'import failed',
      });
      if (mapSrc) {
        set({
          map: { src: mapSrc, width: mapWidth, height: mapHeight, x: mapX, y: mapY, opacity: 0.85, mode: 'image' },
        });
      }
      return { rooms: 0, walls: 0 };
    } finally {
      set({
        generatingProject: false,
        canvasBooting: false,
        suppressCanvasFit: false,
      });
      runWhenIdle(() => set({ mapImportPhase: 'idle', mapImportDetail: null }));
    }
  },
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
    const floors = buildFloorsFromCount(s.project.floorCount, s.project.buildingType);
    const rooms =
      s.rooms.length > 0 ? s.rooms : seedRoomsForProject({ ...s.project, floorPlanSource: 'zero' });
    set({
      map: { src, width, height, x: -width / 2, y: -height / 2, opacity: 1, mode: 'blank' },
      floors,
      activeFloorId: floors[0]!.id,
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
    const manualMode = options.manualMode === true;
    const designMode: DesignMode = manualMode ? 'manual' : 'assisted';
    const mergedProject = { ...project, floorPlanSource, designMode, setupComplete: true };
    const floors = buildFloorsFromCount(mergedProject.floorCount, mergedProject.buildingType);
    const importFile = options.importFile;

    const startMapImport = (generateAfter: boolean) => {
      if (importFile) {
        void get().importMapAndAnalyze(importFile, { generateAfter });
      } else {
        set({ pendingMapImport: true, pendingGenerateAfterImport: generateAfter });
      }
    };

    if (manualMode) {
      let map = s.map;
      let floorPlanTool: FloorPlanTool = 'draw-room';
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
      } else if (options.floorPlan === 'import') {
        floorPlanTool = 'select';
      } else {
        floorPlanTool = 'select';
      }
      set({
        project: mergedProject,
        floors,
        activeFloorId: floors[0]!.id,
        rooms: [],
        nodes: [],
        edges: [],
        controls: {},
        bim: { walls: [], openings: [], gardens: [] },
        map,
        floorPlanTool,
        pendingMapImport,
        pendingGenerateAfterImport: false,
        selectedNodeId: null,
        selectedRoomId: null,
        selectedOpeningId: null,
        selectedWallId: null,
        generatingProject: false,
        canvasBooting: false,
        canvasFitSeq: s.canvasFitSeq + 1,
        historyPast: [],
        historyFuture: [],
      });
      if (options.floorPlan === 'import') startMapImport(false);
      return;
    }

    const baseShell = {
      project: mergedProject,
      floors,
      activeFloorId: floors[0]!.id,
      selectedNodeId: null,
      selectedRoomId: null,
      selectedOpeningId: null,
      selectedWallId: null,
      historyPast: [] as StudioState['historyPast'],
      historyFuture: [] as StudioState['historyFuture'],
    };

    if (options.floorPlan === 'import') {
      set({
        ...baseShell,
        rooms: [],
        nodes: [],
        edges: [],
        controls: {},
        bim: { walls: [], openings: [], gardens: [] },
        map: s.map,
        floorPlanTool: 'select',
        pendingMapImport: false,
        pendingGenerateAfterImport: options.generateDesign,
        generatingProject: !!importFile,
        canvasBooting: false,
        canvasFitSeq: s.canvasFitSeq + 1,
      });
      startMapImport(options.generateDesign);
      return;
    }

    let rooms = s.rooms;
    if (rooms.length === 0 || options.generateDesign) {
      if (options.roomDistribution === 'groundOnly' && mergedProject.floorCount > 1) {
        const template = seedRoomsForBuilding(mergedProject.buildingType, mergedProject.bedrooms);
        rooms = template.map((r) => ({ ...r, floorId: floors[0]!.id }));
      } else {
        rooms = seedRoomsForProject(mergedProject);
      }
    }
    let map = s.map;
    let floorPlanTool = s.floorPlanTool;

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
    }

    const basePatch = {
      ...baseShell,
      rooms,
      map,
      floorPlanTool,
      pendingMapImport: false,
      pendingGenerateAfterImport: false,
    };

    if (!options.generateDesign) {
      const applyBlankProject = () => {
        let nodes = s.nodes;
        let edges = s.edges;
        let controls = s.controls;
        let bim = s.bim;
        if (rooms.length > 0 && mergedProject.smartBuilding) {
          const pack = buildBimOpenings(rooms, mergedProject, s.locale, floors[0]!.id);
          bim = { walls: bim?.walls ?? [], openings: pack.bim.openings, gardens: bim?.gardens ?? [] };
          nodes = mergeOpeningActuators(nodes, pack.actuatorNodes);
          controls = { ...controls, ...pack.controls };
        } else if (rooms.length > 0) {
          const pack = buildBimOpenings(rooms, mergedProject, s.locale, floors[0]!.id);
          bim = { walls: bim?.walls ?? [], openings: pack.bim.openings, gardens: bim?.gardens ?? [] };
        }
        set({ ...basePatch, nodes, edges, controls, bim, generatingProject: false, canvasFitSeq: s.canvasFitSeq + 1 });
      };

      const needsIdle = rooms.length > 4 || mergedProject.smartBuilding;
      if (needsIdle) {
        set({ ...basePatch, generatingProject: true, nodes: [], edges: [], controls: {}, bim: null, canvasFitSeq: s.canvasFitSeq + 1 });
        runWhenIdle(applyBlankProject);
      } else {
        applyBlankProject();
      }
      return;
    }

    invalidateDesignAnalysisCache();
    set({
      ...basePatch,
      generatingProject: true,
      nodes: [],
      edges: [],
      controls: {},
      bim: null,
      designName: s.designName,
      canvasFitSeq: s.canvasFitSeq + 1,
    });

    const locale = s.locale;
    const activeFloorId = floors[0]!.id;
    const runGeneration = () => {
      void runAsyncWhenIdle(async () => {
        try {
          const result = await generateProjectDesignAsync(mergedProject, rooms, locale, activeFloorId);
          invalidateDesignAnalysisCache();
          const cur = get();
          await finalizeProjectGeneration(
            get,
            set,
            cur,
            {
              nodes: result.nodes,
              edges: result.edges,
              controls: result.controls,
              designName: result.designName,
              bim: result.bim,
              map: cur.map,
              rooms,
            },
            deferredWorkFromResult(result as Parameters<typeof deferredWorkFromResult>[0]),
          );
        } catch (err) {
          console.error('[U Smart Studio] project generation failed', err);
          set({ generatingProject: false, canvasBooting: false });
        }
      });
    };

    if (typeof window !== 'undefined') {
      runWhenIdle(runGeneration);
    } else {
      runGeneration();
    }
  },

  reopenWizard: () =>
    set((s) => ({
      project: { ...s.project, setupComplete: false },
      generatingProject: false,
      canvasBooting: false,
      simulating: false,
      selectedNodeId: null,
      selectedRoomId: null,
      selectedOpeningId: null,
      selectedWallId: null,
    })),

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
      spaceKind: room.spaceKind,
      floorId: room.floorId ?? get().activeFloorId,
    };
    set((s) => withHistory(s, { rooms: [...s.rooms, r], selectedRoomId: id, selectedNodeId: null }));
  },

  addRoomTemplate: (label, zone, width, height, spaceKind) => {
    const offset = get().rooms.length * 24;
    get().addRoom({ label, zone, spaceKind, x: -120 + offset, y: -80 + offset, width, height });
  },

  seedDefaultRooms: () => {
    if (isManualDesign(get().project)) return;
    get().applyBuildingLayout({ engineering: false, resetMap: true });
  },

  applyBuildingLayout: (options) => {
    if (isManualDesign(get().project)) {
      return { ok: false, message: 'Manual project: draw rooms and place devices yourself.', changes: 0 };
    }
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

  assignRoomToFloor: (roomId, floorId) =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === roomId);
      if (!room || room.floorId === floorId) return s;
      const rooms = s.rooms.map((r) => (r.id === roomId ? { ...r, floorId } : r));
      const nodes = s.nodes.map((n) => (nodeBelongsToRoom(n, room) ? { ...n, floorId } : n));
      let bim = s.bim;
      if (bim) {
        bim = {
          ...bim,
          openings: bim.openings.map((o) => (o.roomId === roomId ? { ...o, floorId } : o)),
        };
      }
      return withHistory(s, { rooms, nodes, bim });
    }),

  moveRoom: (id, x, y) =>
    set((s) => {
      const room = s.rooms.find((r) => r.id === id);
      if (!room) return s;
      const dx = x - room.x;
      const dy = y - room.y;
      if (dx === 0 && dy === 0) return s;
      const rooms = s.rooms.map((r) => (r.id === id ? { ...r, x, y } : r));
      const nodes = translateNodesForRoomMove(s.nodes, room, dx, dy);
      if (!s.bim) return withHistory(s, { rooms, nodes });
      const walls = mergeEffectiveWalls(s.bim, rooms, s.activeFloorId);
      const openings = resnapOpeningsForRoom(s.bim.openings, id, walls).map((o) =>
        o.roomId === id && !o.wallId ? { ...o, x: o.x + dx, y: o.y + dy, floorId: room.floorId } : o,
      );
      return withHistory(s, { rooms, nodes, bim: { ...s.bim, openings } });
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

  moveWall: (id, x1, y1) =>
    set((s) => {
      if (!s.bim) return s;
      const wall = s.bim.walls.find((w) => w.id === id);
      if (!wall) return s;
      const dx = x1 - wall.x1;
      const dy = y1 - wall.y1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return s;
      const walls = s.bim.walls.map((w) => (w.id === id ? translateWall(w, dx, dy) : w));
      const moved = walls.find((w) => w.id === id)!;
      const openings = s.bim.openings.map((o) => {
        if (o.wallId === id) return orientOpeningOnWall(o, moved, o.along ?? 0.5);
        if (Math.hypot(o.x - wall.x1, o.y - wall.y1) < 120) {
          return { ...o, x: o.x + dx, y: o.y + dy };
        }
        return o;
      });
      return withHistory(s, { bim: { ...s.bim, walls, openings } });
    }),

  removeWall: (id) =>
    set((s) => {
      const wallId = id;
      const bim = s.bim ?? { walls: [], openings: [] };
      const openings = bim.openings.filter((o) => o.wallId !== wallId);
      if (isVirtualRoomWall(wallId)) {
        const hiddenWallIds = [...(bim.hiddenWallIds ?? []), wallId];
        return withHistory(s, {
          bim: { ...bim, hiddenWallIds, openings },
          selectedWallId: s.selectedWallId === wallId ? null : s.selectedWallId,
        });
      }
      return withHistory(s, {
        bim: { ...bim, walls: bim.walls.filter((w) => w.id !== wallId), openings },
        selectedWallId: s.selectedWallId === wallId ? null : s.selectedWallId,
      });
    }),

  addWall: (x1, y1, x2, y2) =>
    set((s) => {
      let sx = x1;
      let sy = y1;
      let ex = x2;
      let ey = y2;
      const dx = ex - sx;
      const dy = ey - sy;
      const len = Math.hypot(dx, dy);
      if (len < 20) return s;
      // Snap nearly horizontal / vertical strokes
      if (Math.abs(dy) < Math.abs(dx) * 0.18) {
        ey = sy;
      } else if (Math.abs(dx) < Math.abs(dy) * 0.18) {
        ex = sx;
      }
      const wall: import('./model').DesignWall = {
        id: uid('uw'),
        x1: sx,
        y1: sy,
        x2: ex,
        y2: ey,
        thickness: 6,
        heightM: 2.8,
        layer: 'user',
        floorId: s.activeFloorId,
        wallType: 'concrete',
        decoration: 'paint',
        color: defaultWallColor('concrete', false),
        outdoor: false,
      };
      const bim: BimModel = {
        walls: [...(s.bim?.walls ?? []), wall],
        openings: s.bim?.openings ?? [],
        gardens: s.bim?.gardens,
        wallMeta: s.bim?.wallMeta,
        ceilingMeta: s.bim?.ceilingMeta,
        hiddenWallIds: s.bim?.hiddenWallIds,
      };
      return withHistory(s, { bim, selectedWallId: wall.id, selectedRoomId: null, selectedOpeningId: null });
    }),

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
        if (patch.thickness != null || patch.heightM != null || patch.wallType != null || patch.decoration != null || patch.color != null) {
          wallMeta[id] = {
            ...wallMeta[id],
            ...(patch.thickness != null ? { thickness: patch.thickness } : {}),
            ...(patch.heightM != null ? { heightM: patch.heightM } : {}),
            ...(patch.wallType != null ? { wallType: patch.wallType } : {}),
            ...(patch.decoration != null ? { decoration: patch.decoration } : {}),
            ...(patch.color != null ? { color: patch.color } : {}),
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
      if (patch.wallType != null || patch.decoration != null || patch.color != null) {
        nextWalls = nextWalls.map((w) =>
          w.id === id
            ? {
                ...w,
                ...(patch.wallType != null ? { wallType: patch.wallType } : {}),
                ...(patch.decoration != null ? { decoration: patch.decoration } : {}),
                ...(patch.color != null ? { color: patch.color } : {}),
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

  updateRoomCeiling: (roomId, patch) =>
    set((s) => {
      const bim = s.bim ?? { walls: [], openings: [] };
      const prev = bim.ceilingMeta ?? {};
      const ceilingMeta = { ...prev, [roomId]: { ...prev[roomId], ...patch } };
      return withHistory(s, { bim: { ...bim, ceilingMeta } });
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
    const nodes = (file.nodes ?? []).map((n) => ({ ...n, floorId: n.floorId ?? floors[0]!.id }));
    const patch: Partial<StudioState> = {
      designName: file.designName ?? '',
      project: normalizeProject(file.project),
      rooms: (file.rooms ?? []).map((r) => ({ ...r, floorId: r.floorId ?? floors[0]!.id })),
      bim: normalizeBim(file.bim),
      floors,
      activeFloorId: file.activeFloorId && floors.some((f) => f.id === file.activeFloorId) ? file.activeFloorId : activeFloorId,
      nodes,
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
    };

    const nodeCount = nodes.length;
    const heavy = nodeCount > 120 || isBulkGeneration(patch.rooms ?? []);
    if (heavy && typeof window !== 'undefined') {
      invalidateDesignAnalysisCache();
      void finalizeProjectGeneration(get, set, get(), patch);
      return;
    }

    set(patch);
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const prefs = readUiPreferences();
    if (Object.keys(prefs).length > 0) set(prefs);
    try {
      const raw = window.localStorage.getItem('studio.design');
      if (raw) {
        const file = JSON.parse(raw) as DesignFile;
        if (file && file.version === 1) {
          const restored = normalizeProject(file.project);
          if (restored.setupComplete) {
            get().loadDesign(file);
          } else {
            set({ project: restored });
          }
        }
      }
      const cloudId = window.localStorage.getItem('studio.cloudProjectId');
      if (cloudId) set({ cloudProjectId: cloudId });
      const cur = get();
      if (cur.bim) set({ bim: normalizeBim(cur.bim) });
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
    set({ generatingProject: true, suppressCanvasFit: true });
    try {
      const { rooms, bim } = await analyzeImportedMap({
        src: s.map.src,
        width: s.map.width,
        height: s.map.height,
        mapX: s.map.x,
        mapY: s.map.y,
        activeFloorId: s.activeFloorId,
        cadBim: null,
      });
      const pre = get();
      await finalizeProjectGeneration(get, set, pre, {
        rooms,
        bim,
        nodes: [],
        edges: [],
        controls: {},
        selectedRoomId: null,
        selectedNodeId: null,
        canvasFitSeq: pre.canvasFitSeq + 1,
      });
      return rooms.length;
    } catch (err) {
      console.error('[U Smart Studio] room detection failed', err);
      set({ generatingProject: false, canvasBooting: false, suppressCanvasFit: false });
      return 0;
    }
  },

  setCanvasViewMode: (mode) => {
    persist('studio.canvasViewMode', mode);
    set((s) => ({ canvasViewMode: mode, canvasFitSeq: s.canvasFitSeq + 1 }));
  },

  fitCanvasView: () => set((s) => ({ canvasFitSeq: s.canvasFitSeq + 1 })),

  setVisualizationMode: (mode) => {
    persist('studio.visualizationMode', mode);
    set((s) => ({
      visualizationMode: mode,
      canvasFitSeq: s.canvasFitSeq + 1,
      ...(mode !== '3d' ? { twin3dFocusSpaceId: null } : {}),
    }));
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
    if (isManualDesign(get().project)) {
      return { ok: false, message: 'Manual project: place devices from the palette.', assumptions: [] };
    }
    set({ generatingProject: true });
    const run = () => {
      try {
        const parsed = parseProjectBrief(text, get().project);
        const result = runAutonomousPipeline(parsed.project, parsed.rooms, get().locale);
        invalidateDesignAnalysisCache();
        set({
          project: result.project,
          designName: result.designName,
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
          generatingProject: false,
        });
        scheduleDeferredCableReroute(get, set);
      } catch (e) {
        console.error('[U Smart Studio] brief generation failed', e);
        set({ generatingProject: false });
      }
    };
    if (typeof window !== 'undefined') {
      runWhenIdle(run);
    } else {
      run();
    }
    return { ok: true, message: 'Generating design…', assumptions: [] };
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
    if (isManualDesign(get().project)) {
      return { ok: false, message: 'Manual project: place devices from the palette.', changes: 0 };
    }
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

  rerouteAllCables: () => scheduleDeferredCableReroute(get, set),

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

  toggleSpaceDimensions: () => {
    const next = !get().showSpaceDimensions;
    persist('studio.spaceDimensions', next ? '1' : '0');
    set({ showSpaceDimensions: next });
  },

  setTwin3dFocusSpace: (spaceId) => {
    const parsed = spaceId ? parseTwin3dSpaceId(spaceId) : null;
    set({
      twin3dFocusSpaceId: spaceId,
      selectedRoomId: parsed?.kind === 'room' ? parsed.entityId : null,
    });
  },
  setTwin3dShowMaterials: (show) => set({ twin3dShowMaterials: show }),

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
    if (isManualDesign(get().project)) return { added: 0 };
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
    const targets = roomId ? s.rooms.filter((r) => r.id === roomId) : s.rooms;
    if (!targets.length) return { added: 0 };

    const before = s.nodes.length;
    const wired = attachRoomElectricalDistribution(s.project, targets, s.nodes, s.edges);
    const nodes = wired.nodes.map((n) =>
      getCatalogEntry(n.catalogId)?.domain === 'cable' ? rerouteCableNode(n, wired.nodes, wired.edges, s.rooms) : n,
    );
    set({ nodes, edges: wired.edges });
    return { added: Math.max(0, nodes.length - before) };
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
    if (isManualDesign(get().project)) return { added: 0 };
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

// Debounced autosave — only when design fields change (not selection/sim UI).
if (typeof window !== 'undefined') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastNodes = useStudio.getState().nodes;
  let lastEdges = useStudio.getState().edges;
  let lastRooms = useStudio.getState().rooms;
  let lastControls = useStudio.getState().controls;
  let lastBim = useStudio.getState().bim;
  let lastDesignName = useStudio.getState().designName;
  let lastMap = useStudio.getState().map;
  let lastProject = useStudio.getState().project;
  let lastFloors = useStudio.getState().floors;
  let lastActiveFloorId = useStudio.getState().activeFloorId;

  useStudio.subscribe((s) => {
    if (
      s.nodes === lastNodes &&
      s.edges === lastEdges &&
      s.rooms === lastRooms &&
      s.controls === lastControls &&
      s.bim === lastBim &&
      s.designName === lastDesignName &&
      s.map === lastMap &&
      s.project === lastProject &&
      s.floors === lastFloors &&
      s.activeFloorId === lastActiveFloorId
    ) {
      return;
    }
    lastNodes = s.nodes;
    lastEdges = s.edges;
    lastRooms = s.rooms;
    lastControls = s.controls;
    lastBim = s.bim;
    lastDesignName = s.designName;
    lastMap = s.map;
    lastProject = s.project;
    lastFloors = s.floors;
    lastActiveFloorId = s.activeFloorId;

    clearTimeout(timer);
    timer = setTimeout(() => {
      runWhenIdle(() => {
        const st = useStudio.getState();
        if (st.generatingProject || st.applyingFixes || st.canvasBooting) return;
        const file: DesignFile = {
          version: 1,
          designName: st.designName,
          nodes: st.nodes,
          edges: st.edges,
          controls: st.controls,
          map: st.map,
          project: st.project,
          rooms: st.rooms,
          bim: st.bim ?? undefined,
          floors: st.floors,
          activeFloorId: st.activeFloorId,
        };
        try {
          window.localStorage.setItem('studio.design', JSON.stringify(file));
        } catch {
          /* quota / serialization issues ignored */
        }
      });
    }, 900);
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
