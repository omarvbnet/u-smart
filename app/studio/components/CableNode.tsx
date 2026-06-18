'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCatalogEntry, type CableSpec } from '../lib/catalog';
import { cableLengthPx } from '../lib/node-layout';
import { useStudio } from '../lib/store';
import { NodeHoverCard } from './NodeHoverCard';
import type { Severity } from '../lib/engine/validation';

export type CableNodeData = {
  nodeId: string;
  catalogId: string;
  label: string;
  lengthM: number;
  rotation: number;
  severity: Severity | null;
  energised: boolean;
  active: boolean;
};

const SEVERITY_STROKE: Record<Severity, string> = {
  critical: '#ef4444',
  warning: '#fb923c',
  recommendation: '#60a5fa',
};

function CableNodeImpl({ data, selected }: NodeProps) {
  const d = data as CableNodeData;
  const entry = getCatalogEntry(d.catalogId) as CableSpec | undefined;
  const simulating = useStudio((s) => s.simulating);
  const lengthPx = cableLengthPx(d.lengthM);
  const color = entry?.color ?? '#f59e0b';
  const stroke = d.severity ? SEVERITY_STROKE[d.severity] : color;
  const strokeW = selected ? 5 : 3.5;
  const live = simulating && d.active;

  return (
    <div
      className="group relative"
      style={{
        width: lengthPx,
        height: 18,
        transform: `rotate(${d.rotation}deg)`,
        transformOrigin: '0 50%',
      }}
    >
      <Handle
        type="target"
        id="a"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--studio-bg)]"
        style={{ left: -4, top: '50%', transform: 'translateY(-50%)', background: color }}
      />
      <Handle
        type="source"
        id="b"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--studio-bg)]"
        style={{ right: -4, top: '50%', transform: 'translateY(-50%)', background: color }}
      />

      <svg width={lengthPx} height={18} className="pointer-events-none overflow-visible">
        <line
          x1={0}
          y1={9}
          x2={lengthPx}
          y2={9}
          stroke={live ? '#22c55e' : stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {selected && (
          <line x1={0} y1={9} x2={lengthPx} y2={9} stroke="#22d3ee" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
        )}
      </svg>

      <div
        className="absolute inset-0"
        style={{ width: lengthPx, height: 18 }}
        title={entry ? `${entry.model} · ${d.lengthM} m` : d.label}
      />

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[var(--studio-panel)]/90 px-1.5 py-0.5 text-[8px] font-semibold text-[var(--studio-text)] opacity-0 shadow group-hover:opacity-100">
        {d.lengthM} m · {entry?.csaMm2 ?? '?'} mm²
      </div>

      <NodeHoverCard
        nodeId={d.nodeId}
        catalogId={d.catalogId}
        label={d.label}
        lengthM={d.lengthM}
        rotation={d.rotation}
      />
    </div>
  );
}

export const CableNode = memo(CableNodeImpl);
