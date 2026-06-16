'use client';

import { useCallback, useMemo, useRef } from 'react';
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
import { getCatalogEntry } from '../lib/catalog';
import { declarationFor } from '../lib/engine/declarations';
import { RTL_LOCALES } from '../lib/i18n';
import type { PortKind } from '../lib/catalog';

const nodeTypes = {
  device: (p: NodeProps) => <DeviceNode {...p} />,
  map: (p: NodeProps) => <MapNode {...p} />,
};

const MAP_ID = '__map__';

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const t = useT();

  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const showDeclarations = useStudio((s) => s.showDeclarations);
  const map = useStudio((s) => s.map);
  const addNodeFromCatalog = useStudio((s) => s.addNodeFromCatalog);
  const moveNode = useStudio((s) => s.moveNode);
  const moveMap = useStudio((s) => s.moveMap);
  const connect = useStudio((s) => s.connect);
  const removeNode = useStudio((s) => s.removeNode);
  const removeEdge = useStudio((s) => s.removeEdge);
  const select = useStudio((s) => s.select);

  const { byNode } = useAnalysis();
  const sim = useSimulation();
  const rtl = RTL_LOCALES.has(locale);

  // nodeId → handleId → port kind, for connection validation.
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
        data: { src: map.src, width: map.width, height: map.height, opacity: map.opacity } satisfies MapNodeData,
        draggable: true,
        selectable: false,
        deletable: false,
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
          declaration: showDeclarations && entry ? declarationFor(entry)?.text ?? null : null,
          energised: s?.energised ?? false,
          active: s?.active ?? false,
        } satisfies DeviceNodeData,
      });
    }
    return list;
  }, [nodes, map, byNode, selectedId, rtl, showDeclarations, sim]);

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
          else moveNode(c.id, c.position.x, c.position.y);
        } else if (c.type === 'remove' && c.id !== MAP_ID) {
          removeNode(c.id);
        }
      }
    },
    [moveNode, moveMap, removeNode],
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

  return (
    <div ref={wrapper} className="relative h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => n.id !== MAP_ID && select(n.id)}
        onPaneClick={() => select(null)}
        onEdgesDelete={(eds) => eds.forEach((e) => removeEdge(e.id))}
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--studio-grid)" />
        <Controls className="!shadow-lg" />
        <MiniMap
          pannable
          zoomable
          className="!bg-[var(--studio-panel)] !border !border-[var(--studio-border)] hidden md:block"
          nodeColor={(n) => getCatalogEntry((n.data as DeviceNodeData)?.catalogId)?.color ?? '#22d3ee'}
          maskColor="rgba(0,0,0,0.35)"
        />
      </ReactFlow>

      {nodes.length === 0 && !map && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="rounded-2xl border border-dashed border-[var(--studio-border)] px-8 py-10 max-w-md">
            <p className="text-base font-semibold text-[var(--studio-text)]">{t('emptyCanvas')}</p>
            <p className="mt-2 text-sm text-[var(--studio-muted)]">{t('emptyHint')}</p>
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
