'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCatalogEntry } from '../lib/catalog';
import { useStudio } from '../lib/store';
import { Icon } from './icon';
import type { Severity } from '../lib/engine/validation';

export type DeviceNodeData = {
  catalogId: string;
  label: string;
  severity: Severity | null;
  rtl: boolean;
};

const SEVERITY_RING: Record<Severity, string> = {
  critical: 'ring-2 ring-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]',
  warning: 'ring-2 ring-orange-400 shadow-[0_0_0_4px_rgba(251,146,60,0.15)]',
  recommendation: 'ring-2 ring-blue-400 shadow-[0_0_0_4px_rgba(96,165,250,0.15)]',
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-orange-400',
  recommendation: 'bg-blue-400',
};

function DeviceNodeImpl({ data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  const entry = getCatalogEntry(d.catalogId);
  const simulating = useStudio((s) => s.simulating);
  if (!entry) return null;

  const startPos = d.rtl ? Position.Right : Position.Left;
  const endPos = d.rtl ? Position.Left : Position.Right;

  return (
    <div
      className={`group relative w-[150px] rounded-xl border bg-[var(--studio-node)] border-[var(--studio-border)] px-3 py-2.5 transition
        ${selected ? 'ring-2 ring-cyan-400' : d.severity ? SEVERITY_RING[d.severity] : ''}`}
    >
      <Handle type="target" id="target" position={startPos} className="!h-3 !w-3 !bg-cyan-400 !border-2 !border-[var(--studio-bg)]" />
      <Handle type="source" id="source" position={endPos} className="!h-3 !w-3 !bg-cyan-400 !border-2 !border-[var(--studio-bg)]" />

      {d.severity && (
        <span className={`absolute -top-1.5 ${d.rtl ? '-left-1.5' : '-right-1.5'} h-3.5 w-3.5 rounded-full ${SEVERITY_DOT[d.severity]} ring-2 ring-[var(--studio-bg)]`} />
      )}

      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${entry.color}1f`, color: entry.color }}
        >
          <Icon name={entry.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-[var(--studio-text)]">{d.label}</div>
          <div className="truncate text-[9px] text-[var(--studio-muted)]">{entry.model}</div>
        </div>
      </div>

      {simulating && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[9px] font-medium text-emerald-400">live</span>
        </div>
      )}
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
