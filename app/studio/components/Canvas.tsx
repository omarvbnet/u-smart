'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  useReactFlow,
  useNodesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudio } from '../lib/store';
import { useIssueByNode, useSimulation, useT } from './hooks';
import { DeviceNode, type DeviceNodeData } from './DeviceNode';
import { CableNode, type CableNodeData } from './CableNode';
import { MapNode, type MapNodeData } from './MapNode';
import { RoomNode, type RoomNodeData } from './RoomNode';
import { WallNode, type WallNodeData } from './WallNode';
import { OpeningNode, type OpeningNodeData } from './OpeningNode';
import { GardenNode, type GardenNodeData } from './GardenNode';
import { CableRouteNode, type CableRouteNodeData } from './CableRouteNode';
import { CanvasChrome } from './CanvasChrome';
import dynamic from 'next/dynamic';
import { CanvasUiProvider } from './CanvasUiContext';
import type { HvacSpec } from '../lib/catalog';
import { getCatalogEntry } from '../lib/catalog';
import { declarationFor } from '../lib/engine/declarations';
import { RTL_LOCALES } from '../lib/i18n';
import { dropPosition, nodeFootprint, nodesForCanvasFit } from '../lib/node-layout';
import type { PortKind } from '../lib/catalog';
import type { DesignNode, DesignRoom } from '../lib/model';
import {
  parseRoutePoints,
  boundingBox,
  toLocalPoints,
  conduitTypeForCable,
  type ConduitType,
  type RoutePoint,
} from '../lib/engine/cable-map';
import type { CableSpec } from '../lib/catalog';
import { useLuxHeatmaps, useLoadHeatmaps, useDigitalTwinSync } from './hooks';
import { openingOpenPercent } from '../lib/engine/opening-layout';
import { mergeEffectiveWalls, wallSegmentsWithGaps, parentWallId } from '../lib/engine/wall-layout';

const nodeTypes = {
  device: (p: NodeProps) => <DeviceNode {...p} />,
  cable: (p: NodeProps) => <CableNode {...p} />,
  map: (p: NodeProps) => <MapNode {...p} />,
  room: (p: NodeProps) => <RoomNode {...p} />,
  wall: (p: NodeProps) => <WallNode {...p} />,
  opening: (p: NodeProps) => <OpeningNode {...p} />,
  garden: (p: NodeProps) => <GardenNode {...p} />,
  cableRoute: (p: NodeProps) => <CableRouteNode {...p} />,
};

const MAP_ID = '__map__';
const roomRfId = (id: string) => `room_${id}`;

const Twin3DView = dynamic(() => import('./Twin3DView').then((m) => m.Twin3DView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--studio-muted)]">3D…</div>
  ),
});

import { roomDimensions, formatSpaceDimensions, dimensionsFromPlanSize } from '../lib/engine/room-dimensions';

function nodeCenterInRoom(n: DesignNode, r: DesignRoom): boolean {
  if (n.params.roomId === r.id) return true;
  const cx = n.x + 21;
  const cy = n.y + 21;
  return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
}

function fallbackCableWorldPoints(n: DesignNode): RoutePoint[] {
  const rot = Number(n.params.rotation ?? 0) * (Math.PI / 180);
  const len = Math.max(40, Number(n.params.lengthM ?? 8) * 4);
  return [
    { x: n.x + 20, y: n.y + 9 },
    { x: n.x + 20 + Math.cos(rot) * len, y: n.y + 9 + Math.sin(rot) * len },
  ];
}

function buildRoomDeviceStats(nodes: DesignNode[], rooms: DesignRoom[], activeFloorId: string) {
  const outlets = new Map<string, number>();
  const vrf = new Map<string, number>();
  for (const r of rooms) {
    if ((r.floorId ?? 'floor_0') !== activeFloorId) continue;
    outlets.set(r.id, 0);
    vrf.set(r.id, 0);
  }
  for (const n of nodes) {
    if (n.floorId && n.floorId !== activeFloorId) continue;
    const entry = getCatalogEntry(n.catalogId);
    if (!entry) continue;
    for (const r of rooms) {
      if ((r.floorId ?? 'floor_0') !== activeFloorId) continue;
      if (!nodeCenterInRoom(n, r)) continue;
      if (entry.category === 'SOCKET' || entry.category === 'APPLIANCE') {
        if (n.params.showOnMap !== false) outlets.set(r.id, (outlets.get(r.id) ?? 0) + 1);
      }
      if ((entry as HvacSpec).hvacType === 'VRF_INDOOR') vrf.set(r.id, (vrf.get(r.id) ?? 0) + 1);
      break;
    }
  }
  return { outlets, vrf };
}

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const draggingIds = useRef<Set<string>>(new Set());
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [wallDrawPreview, setWallDrawPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
  const t = useT();

  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const bim = useStudio((s) => s.bim);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  const selectedOpeningId = useStudio((s) => s.selectedOpeningId);
  const selectedWallId = useStudio((s) => s.selectedWallId);
  const controls = useStudio((s) => s.controls);
  const showDeclarations = useStudio((s) => s.showDeclarations);
  const map = useStudio((s) => s.map);
  const floorPlanTool = useStudio((s) => s.floorPlanTool);
  const addNodeFromCatalog = useStudio((s) => s.addNodeFromCatalog);
  const moveNode = useStudio((s) => s.moveNode);
  const moveRoom = useStudio((s) => s.moveRoom);
  const resizeRoom = useStudio((s) => s.resizeRoom);
  const moveWall = useStudio((s) => s.moveWall);
  const removeWall = useStudio((s) => s.removeWall);
  const addWall = useStudio((s) => s.addWall);
  const moveMap = useStudio((s) => s.moveMap);
  const connect = useStudio((s) => s.connect);
  const removeNode = useStudio((s) => s.removeNode);
  const select = useStudio((s) => s.select);
  const selectRoom = useStudio((s) => s.selectRoom);
  const selectOpening = useStudio((s) => s.selectOpening);
  const selectWall = useStudio((s) => s.selectWall);
  const moveOpening = useStudio((s) => s.moveOpening);
  const addOpening = useStudio((s) => s.addOpening);
  const removeOpening = useStudio((s) => s.removeOpening);
  const addRoom = useStudio((s) => s.addRoom);
  const setFloorPlanTool = useStudio((s) => s.setFloorPlanTool);
  const canvasViewMode = useStudio((s) => s.canvasViewMode);
  const canvasFitSeq = useStudio((s) => s.canvasFitSeq);
  const suppressCanvasFit = useStudio((s) => s.suppressCanvasFit);
  const visualizationMode = useStudio((s) => s.visualizationMode);
  const experienceMode = useStudio((s) => s.experienceMode);
  const simulating = useStudio((s) => s.simulating);
  const mapOverlayMode = useStudio((s) => s.mapOverlayMode);
  const editingCableRouteId = useStudio((s) => s.editingCableRouteId);
  const showOutletsOnMap = useStudio((s) => s.showOutletsOnMap);
  const showSpaceDimensions = useStudio((s) => s.showSpaceDimensions);
  const canvasBooting = useStudio((s) => s.canvasBooting);

  const byNode = useIssueByNode();
  const sim = useSimulation();

  const canvasUi = useMemo(
    () => ({ simulating, visualizationMode, experienceMode }),
    [simulating, visualizationMode, experienceMode],
  );
  const luxHeatmaps = useLuxHeatmaps();
  const loadHeatmaps = useLoadHeatmaps();
  useDigitalTwinSync();
  const rtl = RTL_LOCALES.has(locale);
  const drawing = floorPlanTool === 'draw-room';
  const drawingWall = floorPlanTool === 'draw-wall';
  const drawingAny = drawing || drawingWall;
  const placingOpening = floorPlanTool === 'place-door' || floorPlanTool === 'place-window';

  const portKinds = useMemo(() => {
    const m = new Map<string, Map<string, PortKind>>();
    for (const n of nodes) {
      const entry = getCatalogEntry(n.catalogId);
      if (!entry) continue;
      const inner = new Map<string, PortKind>();
      for (const p of entry.ports) inner.set(p.id, p.kind);
      m.set(n.id, inner);
    }
    return m;
  }, [nodes]);

  const cableNodeIds = useMemo(
    () => new Set(nodes.filter((n) => getCatalogEntry(n.catalogId)?.domain === 'cable').map((n) => n.id)),
    [nodes],
  );

  const effectiveWalls = useMemo(() => mergeEffectiveWalls(bim, rooms, activeFloorId), [bim, rooms, activeFloorId]);
  const cadWallIds = useMemo(() => new Set((bim?.walls ?? []).map((w) => w.id)), [bim?.walls]);

  const roomDeviceStats = useMemo(
    () => buildRoomDeviceStats(nodes, rooms, activeFloorId),
    [nodes, rooms, activeFloorId],
  );

  const storeRfNodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    if (map) {
      list.push({
        id: MAP_ID,
        type: 'map',
        position: { x: map.x, y: map.y },
        style: { width: map.width, height: map.height },
        width: map.width,
        height: map.height,
        data: { src: map.src, width: map.width, height: map.height, opacity: map.opacity, mode: map.mode } satisfies MapNodeData,
        draggable: true,
        selectable: false,
        deletable: false,
        zIndex: -2,
      });
    }
    if (effectiveWalls.length > 0) {
      const planOpenings = bim?.openings ?? [];
      for (const w of effectiveWalls) {
        const segments = wallSegmentsWithGaps(w, planOpenings);
        segments.forEach((seg, i) => {
          const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
          const nodeId = segments.length > 1 ? `wall_${w.id}__${i}` : `wall_${w.id}`;
          list.push({
            id: nodeId,
            type: 'wall',
            position: { x: seg.x1, y: seg.y1 },
            style: { width: len, height: Math.max(seg.thickness * 2, 8) },
            data: { wall: seg, wallId: w.id, selected: w.id === selectedWallId } satisfies WallNodeData,
            draggable: !drawingAny && cadWallIds.has(w.id),
            selectable: !drawingAny,
            deletable: !drawingAny,
            zIndex: 0,
          });
        });
      }
    }
    if (bim) {
      for (const o of bim.openings) {
        if (o.floorId && o.floorId !== activeFloorId) continue;
        list.push({
          id: `open_${o.id}`,
          type: 'opening',
          position: { x: o.x - o.width / 2, y: o.y - o.height / 2 },
          style: { width: o.width, height: o.height },
          data: {
            opening: o,
            openPercent: openingOpenPercent(o, controls),
            selected: o.id === selectedOpeningId,
          } satisfies OpeningNodeData,
          draggable: !drawingAny,
          selectable: !drawingAny,
          deletable: !drawingAny,
          zIndex: 2,
        });
      }
      for (const g of bim.gardens ?? []) {
        if (g.floorId && g.floorId !== activeFloorId) continue;
        list.push({
          id: `garden_${g.id}`,
          type: 'garden',
          position: { x: g.x, y: g.y },
          style: { width: g.width, height: g.height },
          data: { garden: g, showDimensions: showSpaceDimensions } satisfies GardenNodeData,
          draggable: false,
          selectable: false,
          zIndex: -1,
        });
      }
    }
    const luxByRoom = new Map(luxHeatmaps.map((h) => [h.roomId, h]));
    const loadByRoom = new Map(loadHeatmaps.map((h) => [h.roomId, h]));
    for (const r of rooms) {
      if ((r.floorId ?? 'floor_0') !== activeFloorId) continue;
      const outletCount = roomDeviceStats.outlets.get(r.id) ?? 0;
      const vrfUnitCount = roomDeviceStats.vrf.get(r.id) ?? 0;
      list.push({
        id: roomRfId(r.id),
        type: 'room',
        position: { x: r.x, y: r.y },
        style: { width: r.width, height: r.height },
        width: r.width,
        height: r.height,
        data: {
          room: r,
          selected: r.id === selectedRoomId,
          areaM2: roomDimensions(r).areaM2,
          dimensions: roomDimensions(r),
          showDimensions: showSpaceDimensions,
          luxHeatmap: luxByRoom.get(r.id) ?? null,
          loadHeatmap: loadByRoom.get(r.id) ?? null,
          outletCount: showOutletsOnMap ? outletCount : 0,
          vrfUnitCount,
        } satisfies RoomNodeData,
        draggable: !drawing,
        selectable: !drawing,
        zIndex: -1,
      });
    }
    if (!canvasBooting && mapOverlayMode !== 'plan') {
      for (const n of nodes) {
        if (n.floorId && n.floorId !== activeFloorId) continue;
        const entry = getCatalogEntry(n.catalogId);
        if (entry?.domain !== 'cable') continue;
        if (n.params.showOnMap === false) continue;
        let world = parseRoutePoints(n.params);
        if (world.length < 2) world = fallbackCableWorldPoints(n);
        const box = boundingBox(world);
        const local = toLocalPoints(world, { x: box.x, y: box.y });
        const issues = byNode.get(n.id) ?? [];
        const severity = issues.some((i) => i.severity === 'critical')
          ? 'critical'
          : issues.some((i) => i.severity === 'warning')
            ? 'warning'
            : issues.some((i) => i.severity === 'recommendation')
              ? 'recommendation'
              : null;
        const s = sim[n.id];
        const cableEntry = entry as CableSpec;
        const conduitType =
          (n.params.conduitType as ConduitType | undefined) ?? conduitTypeForCable(cableEntry);
        list.push({
          id: `route_${n.id}`,
          type: 'cableRoute',
          position: { x: box.x, y: box.y },
          style: { width: box.w, height: box.h },
          width: box.w,
          height: box.h,
          data: {
            cableId: n.id,
            catalogId: n.catalogId,
            label: String(n.params.cableLabel ?? n.label),
            cableLabel: String(n.params.cableLabel ?? n.label),
            points: local,
            worldOrigin: { x: box.x, y: box.y },
            width: box.w,
            height: box.h,
            conduitType,
            overlayMode: mapOverlayMode,
            selected: n.id === selectedId,
            editing: editingCableRouteId === n.id,
            severity,
            energised: s?.energised ?? false,
            active: s?.active ?? false,
            lengthM: Number(n.params.lengthM ?? 20),
          } satisfies CableRouteNodeData,
          draggable: false,
          selectable: true,
          zIndex: 3,
        });
      }
    }
    if (!canvasBooting) {
      for (const n of nodes) {
        if (n.floorId && n.floorId !== activeFloorId) continue;
        const entry = getCatalogEntry(n.catalogId);
        if (!entry) continue;
        if (
          !showOutletsOnMap &&
          (entry.category === 'SOCKET' || entry.category === 'APPLIANCE') &&
          n.params.showOnMap !== false
        ) {
          continue;
        }
        const issues = byNode.get(n.id) ?? [];
        const severity = issues.some((i) => i.severity === 'critical')
          ? 'critical'
          : issues.some((i) => i.severity === 'warning')
            ? 'warning'
            : issues.some((i) => i.severity === 'recommendation')
              ? 'recommendation'
              : null;
        const s = sim[n.id];
        const footprint = nodeFootprint(entry, n.params, visualizationMode);
        const isCable = entry.domain === 'cable';

        list.push({
          id: n.id,
          type: isCable ? 'cable' : 'device',
          position: { x: n.x, y: n.y },
          style: { width: footprint.width, height: footprint.height },
          width: footprint.width,
          height: footprint.height,
          zIndex: isCable ? 1 : 2,
          selected: n.id === selectedId,
          data: isCable
            ? ({
                nodeId: n.id,
                catalogId: n.catalogId,
                label: n.label,
                lengthM: Number(n.params.lengthM ?? 20),
                rotation: Number(n.params.rotation ?? 0),
                severity,
                energised: s?.energised ?? false,
                active: s?.active ?? false,
              } satisfies CableNodeData)
            : ({
                nodeId: n.id,
                catalogId: n.catalogId,
                label: n.label,
                severity,
                rtl,
                declaration: showDeclarations ? declarationFor(entry, n.params)?.text ?? null : null,
                energised: s?.energised ?? false,
                active: s?.active ?? false,
              } satisfies DeviceNodeData),
        });
      }
    }
    return list;
  }, [nodes, rooms, bim, map, byNode, selectedId, selectedRoomId, selectedOpeningId, selectedWallId, effectiveWalls, cadWallIds, controls, rtl, showDeclarations, simulating, sim, drawing, visualizationMode, luxHeatmaps, loadHeatmaps, activeFloorId, mapOverlayMode, editingCableRouteId, showOutletsOnMap, showSpaceDimensions, roomDeviceStats, canvasBooting]);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState(storeRfNodes);

  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return storeRfNodes.map((n) => {
        const existing = prevById.get(n.id);
        if (!existing) return n;
        const dragging = existing.dragging || draggingIds.current.has(n.id);
        return {
          ...n,
          measured: existing.measured,
          dragging: existing.dragging,
          position: dragging ? existing.position : n.position,
        };
      });
    });
  }, [storeRfNodes, setRfNodes]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges
        .filter((e) => !cableNodeIds.has(e.source) && !cableNodeIds.has(e.target))
        .map((e) => {
        const kind = portKinds.get(e.source)?.get(e.sourceHandle ?? '') ?? 'power';
        const live = sim[e.source]?.active && sim[e.target]?.energised;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          animated: !!live,
          style: { stroke: live ? '#22c55e' : EDGE_COLOR[kind], strokeWidth: live ? 2.5 : 2 },
        };
      }),
    [edges, portKinds, simulating, sim, cableNodeIds],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      if (c.source.startsWith('room_') || c.target.startsWith('room_')) return false;
      const sk = portKinds.get(c.source)?.get(c.sourceHandle ?? '');
      const tk = portKinds.get(c.target)?.get(c.targetHandle ?? '');
      if (!sk || !tk) return false;
      return sk === tk;
    },
    [portKinds],
  );

  const layoutKey = useMemo(
    () => `${nodes.length}:${rooms.length}:${bim?.openings.length ?? 0}:${map?.width ?? 0}:${map?.height ?? 0}`,
    [nodes.length, rooms.length, bim?.openings.length, map?.width, map?.height],
  );

  const storeRfNodesRef = useRef(storeRfNodes);
  storeRfNodesRef.current = storeRfNodes;

  useEffect(() => {
    if (suppressCanvasFit) return;
    if (nodes.length === 0 && rooms.length === 0 && !map) return;
    const timer = window.setTimeout(() => {
      const focus = nodesForCanvasFit(storeRfNodesRef.current, canvasViewMode);
      void fitView({
        nodes: focus.length > 0 ? focus : undefined,
        padding: canvasViewMode === 'full' ? 0.06 : 0.18,
        maxZoom: canvasViewMode === 'full' ? 0.95 : 1.15,
        minZoom: 0.12,
        duration: 320,
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [layoutKey, fitView, nodes.length, rooms.length, map, canvasViewMode, canvasFitSeq, suppressCanvasFit]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onRfNodesChange(changes);
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          if (c.dragging) draggingIds.current.add(c.id);
          else {
            draggingIds.current.delete(c.id);
            if (c.id === MAP_ID) moveMap(c.position.x, c.position.y);
            else if (c.id.startsWith('room_')) moveRoom(c.id.slice(5), c.position.x, c.position.y);
            else if (c.id.startsWith('wall_')) moveWall(parentWallId(c.id.slice(5)), c.position.x, c.position.y);
            else if (c.id.startsWith('open_')) {
              const opening = bim?.openings.find((o) => o.id === c.id.slice(5));
              if (opening && c.position) {
                moveOpening(opening.id, c.position.x + opening.width / 2, c.position.y + opening.height / 2);
              }
            } else moveNode(c.id, c.position.x, c.position.y);
          }
        } else if (c.type === 'dimensions' && c.dimensions && c.id.startsWith('room_')) {
          resizeRoom(c.id.slice(5), c.dimensions.width, c.dimensions.height);
        } else if (c.type === 'remove') {
          draggingIds.current.delete(c.id);
          if (c.id.startsWith('wall_')) removeWall(parentWallId(c.id.slice(5)));
          else if (c.id.startsWith('open_')) removeOpening(c.id.slice(5));
          else if (c.id !== MAP_ID && !c.id.startsWith('room_')) removeNode(c.id);
        }
      }
    },
    [onRfNodesChange, moveNode, moveRoom, moveWall, removeWall, removeOpening, moveOpening, resizeRoom, moveMap, removeNode, bim?.openings],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!isValidConnection(c)) return;
      connect({ source: c.source!, target: c.target!, sourceHandle: c.sourceHandle ?? null, targetHandle: c.targetHandle ?? null });
    },
    [connect, isValidConnection],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const catalogId = event.dataTransfer.getData('application/studio-catalog');
      const entry = catalogId ? getCatalogEntry(catalogId) : undefined;
      if (!entry) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const { x, y } = dropPosition(pos.x, pos.y, entry);
      addNodeFromCatalog(catalogId, x, y);
    },
    [screenToFlowPosition, addNodeFromCatalog],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onPaneMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (placingOpening && e.button === 0) {
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addOpening(floorPlanTool === 'place-door' ? 'door' : 'window', pos.x, pos.y);
        setFloorPlanTool('select');
        return;
      }
      if ((!drawing && !drawingWall) || e.button !== 0) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (drawingWall) {
        drawStart.current = pos;
        setWallDrawPreview({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
        return;
      }
      drawStart.current = pos;
      setDrawPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    },
    [drawing, drawingWall, placingOpening, floorPlanTool, screenToFlowPosition, addOpening, setFloorPlanTool],
  );

  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawStart.current) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (drawingWall) {
        setWallDrawPreview({ x1: drawStart.current.x, y1: drawStart.current.y, x2: pos.x, y2: pos.y });
        return;
      }
      const x = Math.min(drawStart.current.x, pos.x);
      const y = Math.min(drawStart.current.y, pos.y);
      const w = Math.abs(pos.x - drawStart.current.x);
      const h = Math.abs(pos.y - drawStart.current.y);
      setDrawPreview({ x, y, w, h });
    },
    [screenToFlowPosition, drawingWall],
  );

  const onPaneMouseUp = useCallback(() => {
    if (drawingWall && drawStart.current && wallDrawPreview) {
      addWall(wallDrawPreview.x1, wallDrawPreview.y1, wallDrawPreview.x2, wallDrawPreview.y2);
      drawStart.current = null;
      setWallDrawPreview(null);
      setFloorPlanTool('select');
      return;
    }
    if (!drawStart.current || !drawPreview) {
      drawStart.current = null;
      setDrawPreview(null);
      setWallDrawPreview(null);
      return;
    }
    if (drawPreview.w >= 40 && drawPreview.h >= 30) {
      addRoom({
        label: `Room ${rooms.length + 1}`,
        zone: 'general',
        x: drawPreview.x,
        y: drawPreview.y,
        width: drawPreview.w,
        height: drawPreview.h,
      });
    }
    drawStart.current = null;
    setDrawPreview(null);
    setFloorPlanTool('select');
  }, [drawPreview, wallDrawPreview, drawingWall, addRoom, addWall, rooms.length, setFloorPlanTool]);

  return (
    <div
      ref={wrapper}
      className={`relative h-full w-full ${drawingAny || placingOpening ? 'cursor-crosshair' : ''}`}
      onMouseDown={onPaneMouseDown}
      onMouseMove={onPaneMouseMove}
      onMouseUp={onPaneMouseUp}
      onMouseLeave={onPaneMouseUp}
    >
      <CanvasChrome variant="2d" />
      <div className="absolute inset-0 z-[1]">
        <CanvasUiProvider value={canvasUi}>
        <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={onNodesChange}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStop={(_, n) => {
          if (n.id === MAP_ID || n.id.startsWith('room_')) return;
          moveNode(n.id, n.position.x, n.position.y);
          draggingIds.current.delete(n.id);
        }}
        onConnect={onConnect}
        onNodeClick={(_, n) => {
          if (n.id === MAP_ID) return;
          if (n.id.startsWith('room_')) selectRoom(n.id.slice(5));
          else if (n.id.startsWith('open_')) selectOpening(n.id.slice(5));
          else if (n.id.startsWith('wall_')) selectWall((n.data as WallNodeData).wallId ?? parentWallId(n.id.slice(5)));
          else if (n.id.startsWith('route_')) select(n.id.slice(6));
          else select(n.id);
        }}
        onPaneClick={() => {
          if (!drawingAny) {
            select(null);
            selectRoom(null);
            selectOpening(null);
            selectWall(null);
          }
        }}
        onEdgesDelete={(eds) => eds.forEach((e) => useStudio.getState().removeEdge(e.id))}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={!drawingAny}
        minZoom={0.15}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--studio-grid)" />
        <Controls className="!shadow-lg" />
        <MiniMap
          pannable
          zoomable
          className="!bg-[var(--studio-panel)] !border !border-[var(--studio-border)] hidden md:block"
          nodeColor={(n) => {
            if (n.type === 'room') return '#64748b';
            if (n.type === 'cable') return '#f59e0b';
            return getCatalogEntry((n.data as DeviceNodeData)?.catalogId)?.color ?? '#22d3ee';
          }}
          maskColor="rgba(0,0,0,0.35)"
        />
      </ReactFlow>
        </CanvasUiProvider>
      </div>

      {wallDrawPreview && (() => {
        const a = flowToScreenPosition({ x: wallDrawPreview.x1, y: wallDrawPreview.y1 });
        const b = flowToScreenPosition({ x: wallDrawPreview.x2, y: wallDrawPreview.y2 });
        const left = wrapper.current ? a.x - wrapper.current.getBoundingClientRect().left : a.x;
        const top = wrapper.current ? a.y - wrapper.current.getBoundingClientRect().top : a.y;
        const w = b.x - a.x;
        const h = b.y - a.y;
        const len = Math.hypot(w, h);
        const angle = (Math.atan2(h, w) * 180) / Math.PI;
        return (
          <div
            className="pointer-events-none absolute origin-left rounded-full bg-slate-400/80"
            style={{ left, top, width: len, height: 6, transform: `rotate(${angle}deg)` }}
          />
        );
      })()}

      {drawPreview && drawPreview.w > 4 && (() => {
        const tl = flowToScreenPosition({ x: drawPreview.x, y: drawPreview.y });
        const br = flowToScreenPosition({ x: drawPreview.x + drawPreview.w, y: drawPreview.y + drawPreview.h });
        const left = wrapper.current ? tl.x - wrapper.current.getBoundingClientRect().left : tl.x;
        const top = wrapper.current ? tl.y - wrapper.current.getBoundingClientRect().top : tl.y;
        return (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-cyan-400 bg-cyan-400/10"
            style={{ left, top, width: br.x - tl.x, height: br.y - tl.y }}
          >
            {showSpaceDimensions && drawPreview.w >= 40 && drawPreview.h >= 30 && (
              <div className="absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold tabular-nums text-cyan-200">
                {formatSpaceDimensions(dimensionsFromPlanSize(drawPreview.w, drawPreview.h), true)}
              </div>
            )}
          </div>
        );
      })()}

      {nodes.length === 0 && !map && rooms.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="rounded-2xl border border-dashed border-[var(--studio-border)] px-8 py-10 max-w-md">
            <p className="text-base font-semibold text-[var(--studio-text)]">{t('emptyCanvas')}</p>
            <p className="mt-2 text-sm text-[var(--studio-muted)]">{t('emptyHintFloor')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const EDGE_COLOR: Record<PortKind, string> = {
  power: '#f59e0b',
  bus: '#22c55e',
  signal: '#3b82f6',
  control: '#a855f7',
};

export function Canvas() {
  const visualizationMode = useStudio((s) => s.visualizationMode);

  if (visualizationMode === '3d') {
    return (
      <div className="relative h-full w-full min-h-0">
        <div className="absolute inset-0 z-[1]">
          <Twin3DView />
        </div>
        <CanvasChrome variant="3d" />
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
