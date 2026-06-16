'use client';

import { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudio } from '../lib/store';
import { useAnalysis, useT } from './hooks';
import { DeviceNode, type DeviceNodeData } from './DeviceNode';
import { getCatalogEntry } from '../lib/catalog';
import { RTL_LOCALES } from '../lib/i18n';

const nodeTypes = { device: (p: NodeProps) => <DeviceNode {...p} /> };

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const t = useT();

  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const addNodeFromCatalog = useStudio((s) => s.addNodeFromCatalog);
  const moveNode = useStudio((s) => s.moveNode);
  const connect = useStudio((s) => s.connect);
  const removeNode = useStudio((s) => s.removeNode);
  const removeEdge = useStudio((s) => s.removeEdge);
  const select = useStudio((s) => s.select);

  const { byNode } = useAnalysis();
  const rtl = RTL_LOCALES.has(locale);

  const rfNodes = useMemo<Node<DeviceNodeData>[]>(
    () =>
      nodes.map((n) => {
        const issues = byNode.get(n.id) ?? [];
        const severity = issues.some((i) => i.severity === 'critical')
          ? 'critical'
          : issues.some((i) => i.severity === 'warning')
            ? 'warning'
            : issues.some((i) => i.severity === 'recommendation')
              ? 'recommendation'
              : null;
        return {
          id: n.id,
          type: 'device',
          position: { x: n.x, y: n.y },
          selected: n.id === selectedId,
          data: { catalogId: n.catalogId, label: n.label, severity, rtl },
        };
      }),
    [nodes, byNode, selectedId, rtl],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: true,
        style: { stroke: '#22d3ee', strokeWidth: 2 },
      })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) moveNode(c.id, c.position.x, c.position.y);
        else if (c.type === 'remove') removeNode(c.id);
      }
    },
    [moveNode, removeNode],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      connect({ source: c.source, target: c.target, sourceHandle: c.sourceHandle ?? 'source', targetHandle: c.targetHandle ?? 'target' });
    },
    [connect],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const catalogId = event.dataTransfer.getData('application/studio-catalog');
      if (!catalogId || !getCatalogEntry(catalogId)) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeFromCatalog(catalogId, pos.x - 75, pos.y - 25);
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
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onPaneClick={() => select(null)}
        onEdgesDelete={(eds) => eds.forEach((e) => removeEdge(e.id))}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true }}
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

      {nodes.length === 0 && (
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

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
