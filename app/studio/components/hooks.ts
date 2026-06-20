'use client';

import { computeLuxHeatmaps } from '../lib/engine/lux-heatmap';
import { computeLoadHeatmaps } from '../lib/engine/load-heatmap';
import { getTwinConnection } from '../lib/twin-stream';
import { useEffect, useMemo, useDeferredValue } from 'react';
import { useStudio } from '../lib/store';
import { createTranslator } from '../lib/i18n';
import { getCatalogEntry, type CableSpec } from '../lib/catalog';
import { CABLES } from '../lib/catalog/cables';
import { resolveNodes } from '../lib/model';
import { validateDesign, type Issue } from '../lib/engine/validation';
import { validatePlacement } from '../lib/engine/placement-validation';
import { suggestSmartFixes } from '../lib/engine/autofix';
import { calculateHvacLoads } from '../lib/engine/hvac-loads';
import { calculateLightingDesign } from '../lib/engine/lighting-design';
import { validateLightingDesign } from '../lib/engine/lighting-validation';
import { buildSmartTopology, isBusPowerAdequate } from '../lib/engine/smarthome-topology';
import { computeQuality, computeCompliance } from '../lib/engine/quality';
import { simulate } from '../lib/engine/simulate';

/** Translator bound to the current locale. */
export function useT() {
  const locale = useStudio((s) => s.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

/** Severity badges on canvas — skips quality/compliance scoring for speed. */
export function useIssueByNode() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const project = useStudio((s) => s.project);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const deferredNodes = useDeferredValue(nodes);
  const deferredEdges = useDeferredValue(edges);

  return useMemo(() => {
    const resolved = resolveNodes(deferredNodes, getCatalogEntry);
    const activeRooms = rooms.filter((r) => !r.floorId || r.floorId === activeFloorId);
    const activeResolved = resolved.filter((n) => !n.floorId || n.floorId === activeFloorId);
    const { issues: engIssues } = validateDesign(activeResolved, deferredEdges, CABLES as CableSpec[]);
    const placeIssues = validatePlacement(
      deferredNodes.filter((n) => !n.floorId || n.floorId === activeFloorId),
      activeRooms,
      getCatalogEntry,
    );
    const lightingIssues = validateLightingDesign(activeResolved, activeRooms);
    const smartIssues = suggestSmartFixes(project, deferredNodes, deferredEdges, activeRooms);
    const issues = [...engIssues, ...placeIssues, ...lightingIssues, ...smartIssues];
    const byNode = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const arr = byNode.get(i.nodeId) ?? [];
      arr.push(i);
      byNode.set(i.nodeId, arr);
    }
    return byNode;
  }, [deferredNodes, deferredEdges, rooms, project, activeFloorId]);
}

/** Full validation + quality + compliance derived from the live design. */
export function useAnalysis() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const project = useStudio((s) => s.project);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const deferredNodes = useDeferredValue(nodes);
  const deferredEdges = useDeferredValue(edges);

  return useMemo(() => {
    const resolved = resolveNodes(deferredNodes, getCatalogEntry);
    const activeRooms = rooms.filter((r) => !r.floorId || r.floorId === activeFloorId);
    const activeResolved = resolved.filter((n) => !n.floorId || n.floorId === activeFloorId);
    const { issues: engIssues } = validateDesign(activeResolved, deferredEdges, CABLES as CableSpec[]);
    const placeIssues = validatePlacement(
      deferredNodes.filter((n) => !n.floorId || n.floorId === activeFloorId),
      activeRooms,
      getCatalogEntry,
    );
    const lightingIssues = validateLightingDesign(activeResolved, activeRooms);
    const smartIssues = suggestSmartFixes(project, deferredNodes, deferredEdges, activeRooms);
    const issues = [...engIssues, ...placeIssues, ...lightingIssues, ...smartIssues];
    const quality = computeQuality(issues, resolved.length);
    const compliance = computeCompliance(issues);
    const byNode = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const arr = byNode.get(i.nodeId) ?? [];
      arr.push(i);
      byNode.set(i.nodeId, arr);
    }
    return { issues, quality, compliance, byNode, isStale: deferredNodes !== nodes || deferredEdges !== edges };
  }, [deferredNodes, deferredEdges, nodes, edges, rooms, project, activeFloorId]);
}

/** Live simulation state per node (energised / active / current). */
export function useSimulation() {
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

/** HVAC, lighting, and smart-home engineering reports (deterministic). */
export function useAutonomousReports() {
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const project = useStudio((s) => s.project);
  const assumptions = useStudio((s) => s.autonomousAssumptions);

  return useMemo(() => {
    const hvac = calculateHvacLoads(rooms, project.buildingType);
    const lighting = calculateLightingDesign(rooms);
    const smart = buildSmartTopology(project, nodes, edges, rooms);
    return { hvac, lighting, smart, assumptions };
  }, [nodes, edges, rooms, project, assumptions]);
}

/** Per-room lux heatmap grids for canvas overlay. */
export function useLuxHeatmaps() {
  const nodes = useStudio((s) => s.nodes);
  const rooms = useStudio((s) => s.rooms);
  const show = useStudio((s) => s.showLuxHeatmap);

  return useMemo(() => {
    if (!show || !rooms.length) return [];
    const resolved = resolveNodes(nodes, getCatalogEntry);
    return computeLuxHeatmaps(rooms, resolved);
  }, [nodes, rooms, show]);
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

  return useMemo(() => {
    if (!show || !rooms.length) return [];
    const resolved = resolveNodes(nodes, getCatalogEntry);
    return computeLoadHeatmaps(rooms, resolved);
  }, [nodes, rooms, show]);
}
