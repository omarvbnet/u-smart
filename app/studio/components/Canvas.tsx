'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  useReactFlow,
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
import { MapNode, type MapNodeData } from './MapNode';
import { RoomNode, type RoomNodeData } from './RoomNode';
import { FloorPlanToolbar } from './FloorPlanToolbar';
import { getCatalogEntry } from '../lib/catalog';
import { declarationFor } from '../lib/engine/declarations';
import { RTL_LOCALES } from '../lib/i18n';
import type { PortKind } from '../lib/catalog';

const nodeTypes = {
  device: (p: NodeProps) => <DeviceNode {...p} />,
  map: (p: NodeProps) => <MapNode {...p} />,
  room: (p: NodeProps) => <RoomNode {...p} />,
};

const MAP_ID = '__map__';
const roomRfId = (id: string) => `room_${id}`;

function roomAreaM2(w: number, h: number): number {
  return (w / 50) * (h / 50);
}

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawPreview, setDrawPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const t = useT();

  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const rooms = useStudio((s) => s.rooms);
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

  const { byNode } = useAnalysis();
  const sim = useSimulation();
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

  const rfNodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    if (map) {
      list.push({
        id: MAP_ID,
        type: 'map',
        position: { x: map.x, y: map.y },
        data: { src: map.src, width: map.width, height: map.height, opacity: map.opacity, mode: map.mode } satisfies MapNodeData,
        draggable: true,
        selectable: false,
        deletable: false,
        zIndex: -2,
      });
    }
    for (const r of rooms) {
      list.push({
        id: roomRfId(r.id),
        type: 'room',
        position: { x: r.x, y: r.y },
        style: { width: r.width, height: r.height },
        data: { room: r, selected: r.id === selectedRoomId, areaM2: roomAreaM2(r.width, r.height) } satisfies RoomNodeData,
        draggable: !drawing,
        selectable: !drawing,
        zIndex: -1,
      });
    }
    for (const n of nodes) {
      const entry = getCatalogEntry(n.catalogId);
      const issues = byNode.get(n.id) ?? [];
      const severity = issues.some((i) => i.severity === 'critical')
        ? 'critical'
        : issues.some((i) => i.severity === 'warning')
          ? 'warning'
          : issues.some((i) => i.severity === 'recommendation')
            ? 'recommendation'
            : null;
      const s = sim[n.id];
      list.push({
        id: n.id,
        type: 'device',
        position: { x: n.x, y: n.y },
        selected: n.id === selectedId,
        data: {
          catalogId: n.catalogId,
          label: n.label,
          severity,
          rtl,
          declaration: showDeclarations && entry ? declarationFor(entry, n.params)?.text ?? null : null,
          energised: s?.energised ?? false,
          active: s?.active ?? false,
        } satisfies DeviceNodeData,
      });
    }
    return list;
  }, [nodes, rooms, map, byNode, selectedId, selectedRoomId, rtl, showDeclarations, sim, drawing]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
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
    [edges, portKinds, sim],
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

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          if (c.id === MAP_ID) moveMap(c.position.x, c.position.y);
          else if (c.id.startsWith('room_')) moveRoom(c.id.slice(5), c.position.x, c.position.y);
          else moveNode(c.id, c.position.x, c.position.y);
        } else if (c.type === 'dimensions' && c.dimensions && c.id.startsWith('room_')) {
          resizeRoom(c.id.slice(5), c.dimensions.width, c.dimensions.height);
        } else if (c.type === 'remove') {
          if (c.id !== MAP_ID && !c.id.startsWith('room_')) removeNode(c.id);
        }
      }
    },
    [moveNode, moveRoom, resizeRoom, moveMap, removeNode],
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
      if (!catalogId || !getCatalogEntry(catalogId)) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeFromCatalog(catalogId, pos.x - 78, pos.y - 28);
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
      onDrop={onDrop}
      onDragOver={onDragOver}
      onMouseMove={onPaneMouseMove}
      onMouseUp={onPaneMouseUp}
      onMouseLeave={onPaneMouseUp}
    >
      <FloorPlanToolbar />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={onNodesChange}
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
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={!drawing}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--studio-grid)" />
        <Controls className="!shadow-lg" />
        <MiniMap
          pannable
          zoomable
          className="!bg-[var(--studio-panel)] !border !border-[var(--studio-border)] hidden md:block"
          nodeColor={(n) => {
            if (n.type === 'room') return '#64748b';
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
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
