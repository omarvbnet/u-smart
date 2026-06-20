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
import { useAnalysis, useSimulation, useT } from './hooks';
import { DeviceNode, type DeviceNodeData } from './DeviceNode';
import { CableNode, type CableNodeData } from './CableNode';
import { MapNode, type MapNodeData } from './MapNode';
import { RoomNode, type RoomNodeData } from './RoomNode';
import { WallNode, type WallNodeData } from './WallNode';
import { OpeningNode, type OpeningNodeData } from './OpeningNode';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { VisualizationToolbar } from './VisualizationToolbar';
import { DesignAssistantPanel } from './DesignAssistantPanel';
import { ClientExperienceBar } from './ClientExperienceBar';
import { Twin3DView } from './Twin3DView';
import { getCatalogEntry } from '../lib/catalog';
import { declarationFor } from '../lib/engine/declarations';
import { RTL_LOCALES } from '../lib/i18n';
import { dropPosition, nodeFootprint, nodesForCanvasFit } from '../lib/node-layout';
import type { PortKind } from '../lib/catalog';
import { useLuxHeatmaps, useDigitalTwinSync } from './hooks';

const nodeTypes = {
  device: (p: NodeProps) => <DeviceNode {...p} />,
  cable: (p: NodeProps) => <CableNode {...p} />,
  map: (p: NodeProps) => <MapNode {...p} />,
  room: (p: NodeProps) => <RoomNode {...p} />,
  wall: (p: NodeProps) => <WallNode {...p} />,
  opening: (p: NodeProps) => <OpeningNode {...p} />,
};

const MAP_ID = '__map__';
const roomRfId = (id: string) => `room_${id}`;

function roomAreaM2(w: number, h: number): number {
  return (w / 50) * (h / 50);
}

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const draggingIds = useRef<Set<string>>(new Set());
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();
  const t = useT();

  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
  const bim = useStudio((s) => s.bim);
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  const showDeclarations = useStudio((s) => s.showDeclarations);
  const map = useStudio((s) => s.map);
  const floorPlanTool = useStudio((s) => s.floorPlanTool);
  const addNodeFromCatalog = useStudio((s) => s.addNodeFromCatalog);
  const moveNode = useStudio((s) => s.moveNode);
  const moveRoom = useStudio((s) => s.moveRoom);
  const resizeRoom = useStudio((s) => s.resizeRoom);
  const moveMap = useStudio((s) => s.moveMap);
  const connect = useStudio((s) => s.connect);
  const removeNode = useStudio((s) => s.removeNode);
  const select = useStudio((s) => s.select);
  const selectRoom = useStudio((s) => s.selectRoom);
  const addRoom = useStudio((s) => s.addRoom);
  const setFloorPlanTool = useStudio((s) => s.setFloorPlanTool);
  const canvasViewMode = useStudio((s) => s.canvasViewMode);
  const canvasFitSeq = useStudio((s) => s.canvasFitSeq);
  const visualizationMode = useStudio((s) => s.visualizationMode);

  const { byNode } = useAnalysis();
  const sim = useSimulation();
  const luxHeatmaps = useLuxHeatmaps();
  useDigitalTwinSync();
  const rtl = RTL_LOCALES.has(locale);
  const drawing = floorPlanTool === 'draw-room';

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
    if (bim) {
      for (const w of bim.walls) {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        list.push({
          id: `wall_${w.id}`,
          type: 'wall',
          position: { x: w.x1, y: w.y1 },
          style: { width: len, height: w.thickness * 2 },
          data: { wall: w } satisfies WallNodeData,
          draggable: false,
          selectable: false,
          zIndex: -1,
        });
      }
      for (const o of bim.openings) {
        list.push({
          id: `open_${o.id}`,
          type: 'opening',
          position: { x: o.x - o.width / 2, y: o.y - o.height / 2 },
          style: { width: o.width, height: o.height },
          data: { opening: o } satisfies OpeningNodeData,
          draggable: false,
          selectable: false,
          zIndex: 0,
        });
      }
    }
    const luxByRoom = new Map(luxHeatmaps.map((h) => [h.roomId, h]));
    for (const r of rooms) {
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
          areaM2: roomAreaM2(r.width, r.height),
          luxHeatmap: luxByRoom.get(r.id) ?? null,
        } satisfies RoomNodeData,
        draggable: !drawing,
        selectable: !drawing,
        zIndex: -1,
      });
    }
    for (const n of nodes) {
      const entry = getCatalogEntry(n.catalogId);
      if (!entry) continue;
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
    return list;
  }, [nodes, rooms, bim, map, byNode, selectedId, selectedRoomId, rtl, showDeclarations, sim, drawing, visualizationMode, luxHeatmaps]);

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
    [edges, portKinds, sim, cableNodeIds],
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
    () => `${nodes.length}:${rooms.length}:${map?.width ?? 0}:${map?.height ?? 0}`,
    [nodes.length, rooms.length, map?.width, map?.height],
  );

  const storeRfNodesRef = useRef(storeRfNodes);
  storeRfNodesRef.current = storeRfNodes;

  useEffect(() => {
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
  }, [layoutKey, fitView, nodes.length, rooms.length, map, canvasViewMode, canvasFitSeq]);

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
            else moveNode(c.id, c.position.x, c.position.y);
          }
        } else if (c.type === 'dimensions' && c.dimensions && c.id.startsWith('room_')) {
          resizeRoom(c.id.slice(5), c.dimensions.width, c.dimensions.height);
        } else if (c.type === 'remove') {
          draggingIds.current.delete(c.id);
          if (c.id !== MAP_ID && !c.id.startsWith('room_')) removeNode(c.id);
        }
      }
    },
    [onRfNodesChange, moveNode, moveRoom, resizeRoom, moveMap, removeNode],
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
      if (!drawing || e.button !== 0) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      drawStart.current = pos;
      setDrawPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    },
    [drawing, screenToFlowPosition],
  );

  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawStart.current) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const x = Math.min(drawStart.current.x, pos.x);
      const y = Math.min(drawStart.current.y, pos.y);
      const w = Math.abs(pos.x - drawStart.current.x);
      const h = Math.abs(pos.y - drawStart.current.y);
      setDrawPreview({ x, y, w, h });
    },
    [screenToFlowPosition],
  );

  const onPaneMouseUp = useCallback(() => {
    if (!drawStart.current || !drawPreview) {
      drawStart.current = null;
      setDrawPreview(null);
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
  }, [drawPreview, addRoom, rooms.length, setFloorPlanTool]);

  return (
    <div
      ref={wrapper}
      className={`relative h-full w-full ${drawing ? 'cursor-crosshair' : ''}`}
      onMouseDown={onPaneMouseDown}
      onMouseMove={onPaneMouseMove}
      onMouseUp={onPaneMouseUp}
      onMouseLeave={onPaneMouseUp}
    >
      <FloorPlanToolbar />
      <VisualizationToolbar />
      <DesignAssistantPanel />
      <ClientExperienceBar />
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
          else select(n.id);
        }}
        onPaneClick={() => {
          if (!drawing) {
            select(null);
            selectRoom(null);
          }
        }}
        onEdgesDelete={(eds) => eds.forEach((e) => useStudio.getState().removeEdge(e.id))}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={!drawing}
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

      {drawPreview && drawPreview.w > 4 && (() => {
        const tl = flowToScreenPosition({ x: drawPreview.x, y: drawPreview.y });
        const br = flowToScreenPosition({ x: drawPreview.x + drawPreview.w, y: drawPreview.y + drawPreview.h });
        const left = wrapper.current ? tl.x - wrapper.current.getBoundingClientRect().left : tl.x;
        const top = wrapper.current ? tl.y - wrapper.current.getBoundingClientRect().top : tl.y;
        return (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-cyan-400 bg-cyan-400/10"
            style={{ left, top, width: br.x - tl.x, height: br.y - tl.y }}
          />
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
      <div className="relative h-full w-full">
        <VisualizationToolbar />
        <ClientExperienceBar />
        <DesignAssistantPanel />
        <Twin3DView />
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
