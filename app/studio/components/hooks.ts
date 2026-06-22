'use client';

import { computeLuxHeatmaps } from '../lib/engine/lux-heatmap';
import { computeLoadHeatmaps } from '../lib/engine/load-heatmap';
import { getTwinConnection } from '../lib/twin-stream';
import { createContext, createElement, useContext, useEffect, useMemo, useDeferredValue, type ReactNode } from 'react';
import { useStudio } from '../lib/store';
import { createTranslator } from '../lib/i18n';
import { getCatalogEntry } from '../lib/catalog';
import { resolveNodes } from '../lib/model';
import { calculateHvacLoads } from '../lib/engine/hvac-loads';
import { calculateLightingDesign } from '../lib/engine/lighting-design';
import { buildSmartTopology, isBusPowerAdequate } from '../lib/engine/smarthome-topology';
import { simulate } from '../lib/engine/simulate';
import { computeDesignAnalysis } from '../lib/design-analysis';

/** Translator bound to the current locale. */
export function useT() {
  const locale = useStudio((s) => s.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

function useDesignInputs() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const project = useStudio((s) => s.project);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const deferredNodes = useDeferredValue(nodes);
  const deferredEdges = useDeferredValue(edges);
  return { nodes, edges, rooms, project, activeFloorId, deferredNodes, deferredEdges };
}

/** Shared validation cache — one compute pass per design revision. */
export function useDesignAnalysis() {
  const generatingProject = useStudio((s) => s.generatingProject);
  const applyingFixes = useStudio((s) => s.applyingFixes);
  const setupComplete = useStudio((s) => s.project.setupComplete);
  const { nodes, edges, rooms, project, activeFloorId, deferredNodes, deferredEdges } = useDesignInputs();
  return useMemo(() => {
    if (generatingProject || applyingFixes || !setupComplete) {
      return {
        issues: [],
        byNode: new Map<string, import('../lib/engine/validation').Issue[]>(),
        quality: { overall: 0, factors: [] },
        compliance: [],
        isStale: false,
      };
    }
    const analysis = computeDesignAnalysis(deferredNodes, deferredEdges, rooms, project, activeFloorId);
    return { ...analysis, isStale: deferredNodes !== nodes || deferredEdges !== edges };
  }, [generatingProject, applyingFixes, setupComplete, deferredNodes, deferredEdges, nodes, edges, rooms, project, activeFloorId]);
}

/** @deprecated use useDesignAnalysis — kept for existing imports */
export function useAnalysis() {
  return useDesignAnalysis();
}

/** Canvas severity badges — same cache as useDesignAnalysis */
export function useIssueByNode() {
  const { byNode } = useDesignAnalysis();
  return byNode;
}

/** Live simulation state per node (energised / active / current). */
function useSimulationState() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const controls = useStudio((s) => s.controls);
  const project = useStudio((s) => s.project);
  const simulating = useStudio((s) => s.simulating);

  return useMemo(() => {
    if (!simulating) return {} as ReturnType<typeof simulate>;
    const resolved = resolveNodes(nodes, getCatalogEntry);
    const busPowerOk = isBusPowerAdequate(project, nodes);
    return simulate(resolved, edges, controls, { busPowerOk });
  }, [nodes, edges, controls, project, simulating]);
}

const SimulationContext = createContext<ReturnType<typeof simulate> | null>(null);
const EMPTY_SIM = {} as ReturnType<typeof simulate>;

/** One simulation pass shared by Canvas, HUD, and 3D twin. */
export function SimulationProvider({ children }: { children: ReactNode }) {
  const sim = useSimulationState();
  return createElement(SimulationContext.Provider, { value: sim }, children);
}

export function useSimulation() {
  return useContext(SimulationContext) ?? EMPTY_SIM;
}

/** HVAC, lighting, and smart-home engineering reports (deterministic). */
export function useAutonomousReports() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const project = useStudio((s) => s.project);
  const assumptions = useStudio((s) => s.autonomousAssumptions);
  const canvasBooting = useStudio((s) => s.canvasBooting);
  const generatingProject = useStudio((s) => s.generatingProject);

  return useMemo(() => {
    if (canvasBooting || generatingProject || !project.setupComplete) {
      return {
        hvac: { rooms: [], totalCoolingKw: 0, totalHeatingKw: 0, recommendedSystems: [] as const },
        lighting: { rooms: [], totalPowerW: 0, totalFixtures: 0, assumptions: [] },
        smart: { modules: [], busSegments: [], issues: [] },
        assumptions,
      };
    }
    const hvac = calculateHvacLoads(rooms, project.buildingType);
    const lighting = calculateLightingDesign(rooms);
    const smart = buildSmartTopology(project, nodes, edges, rooms);
    return { hvac, lighting, smart, assumptions };
  }, [nodes, edges, rooms, project, assumptions, canvasBooting, generatingProject]);
}

/** Per-room lux heatmap grids for canvas overlay. */
export function useLuxHeatmaps() {
  const nodes = useStudio((s) => s.nodes);
  const rooms = useStudio((s) => s.rooms);
  const show = useStudio((s) => s.showLuxHeatmap);
  const deferredNodes = useDeferredValue(nodes);

  return useMemo(() => {
    if (!show || !rooms.length) return [];
    const resolved = resolveNodes(deferredNodes, getCatalogEntry);
    return computeLuxHeatmaps(rooms, resolved);
  }, [deferredNodes, rooms, show]);
}

/** Sync digital twin SSE session with store when simulating. */
export function useDigitalTwinSync() {
  const simulating = useStudio((s) => s.simulating);
  const twinConnected = useStudio((s) => s.twinConnected);

  useEffect(() => {
    if (!simulating) return;
    const conn = getTwinConnection();
    return conn.subscribe((live) => {
      useStudio.setState({
        twinConnected: live.connection === 'connected',
        twinSessionId: live.sessionId,
      });
    });
  }, [simulating]);

  return { twinConnected };
}

/** Per-room electrical load density heatmap. */
export function useLoadHeatmaps() {
  const nodes = useStudio((s) => s.nodes);
  const rooms = useStudio((s) => s.rooms);
  const show = useStudio((s) => s.showLoadHeatmap);
  const deferredNodes = useDeferredValue(nodes);

  return useMemo(() => {
    if (!show || !rooms.length) return [];
    const resolved = resolveNodes(deferredNodes, getCatalogEntry);
    return computeLoadHeatmaps(rooms, resolved);
  }, [deferredNodes, rooms, show]);
}
