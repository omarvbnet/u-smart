'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCatalogEntry, type ComponentPort, type PortKind } from '../lib/catalog';
import { useStudio } from '../lib/store';
import { EntryImage } from './EntryImage';
import type { Severity } from '../lib/engine/validation';

export type DeviceNodeData = {
  catalogId: string;
  label: string;
  severity: Severity | null;
  rtl: boolean;
  declaration: string | null;
  energised: boolean;
  active: boolean;
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

/** Handle colour per electrical port kind so compatible ports read at a glance. */
export const PORT_COLOR: Record<PortKind, string> = {
  power: '#f59e0b',
  bus: '#22c55e',
  signal: '#3b82f6',
  control: '#a855f7',
};

type Placed = { port: ComponentPort; side: 'lead' | 'trail'; topPct: number };

/** Distribute ports onto leading/trailing edges of the node. */
export function layoutPorts(ports: ComponentPort[]): Placed[] {
  const inout = ports.filter((p) => p.direction === 'inout');
  const splitInout = inout.length === 2 && ports.length === 2;
  const lead: ComponentPort[] = [];
  const trail: ComponentPort[] = [];
  ports.forEach((p, i) => {
    if (p.direction === 'in') lead.push(p);
    else if (p.direction === 'out') trail.push(p);
    else if (splitInout) (i === 0 ? lead : trail).push(p);
    else trail.push(p);
  });
  const place = (arr: ComponentPort[], side: 'lead' | 'trail'): Placed[] =>
    arr.map((port, i) => ({ port, side, topPct: ((i + 1) / (arr.length + 1)) * 100 }));
  return [...place(lead, 'lead'), ...place(trail, 'trail')];
}

function DeviceNodeImpl({ data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  const entry = getCatalogEntry(d.catalogId);
  const simulating = useStudio((s) => s.simulating);
  if (!entry) {
    return (
      <div className="w-[156px] rounded-xl border border-dashed border-orange-400 bg-[var(--studio-node)] px-3 py-2.5 text-[10px] text-orange-400">
        Unknown: {d.catalogId}
      </div>
    );
  }

  const leadPos = d.rtl ? Position.Right : Position.Left;
  const trailPos = d.rtl ? Position.Left : Position.Right;
  const placed = layoutPorts(entry.ports);

  return (
    <div
      className={`group relative w-[156px] rounded-xl border bg-[var(--studio-node)] px-3 py-2.5 transition
        ${selected ? 'ring-2 ring-cyan-400' : d.severity ? SEVERITY_RING[d.severity] : 'border-[var(--studio-border)]'}
        ${simulating && d.active ? 'shadow-[0_0_18px_rgba(34,211,238,0.45)]' : ''}`}
      style={{ borderColor: selected ? undefined : d.severity ? undefined : 'var(--studio-border)' }}
    >
      {placed.map((p) => (
        <Handle
          key={`${p.side}-${p.port.id}`}
          type={p.side === 'lead' ? 'target' : 'source'}
          id={p.port.id}
          position={p.side === 'lead' ? leadPos : trailPos}
          style={{ top: `${p.topPct}%`, background: PORT_COLOR[p.port.kind], borderColor: 'var(--studio-bg)' }}
          className="!h-3 !w-3 !border-2"
          title={p.port.label[d.rtl ? 'ar' : 'en']}
        />
      ))}

      {d.severity && (
        <span className={`absolute -top-1.5 ${d.rtl ? '-left-1.5' : '-right-1.5'} h-3.5 w-3.5 rounded-full ${SEVERITY_DOT[d.severity]} ring-2 ring-[var(--studio-bg)]`} />
      )}

      {simulating && (
        <span
          className={`absolute -top-1.5 ${d.rtl ? '-right-1.5' : '-left-1.5'} flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold ring-2 ring-[var(--studio-bg)]
            ${d.active ? 'bg-emerald-500 text-white' : d.energised ? 'bg-amber-500 text-white' : 'bg-zinc-500 text-white'}`}
        >
          {d.active ? 'ON' : d.energised ? '~' : 'OFF'}
        </span>
      )}

      <div className="flex items-center gap-2.5">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
          <EntryImage entry={entry} className="h-10 w-10" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-[var(--studio-text)]">{d.label}</div>
          <div className="truncate text-[9px] text-[var(--studio-muted)]">{entry.model}</div>
        </div>
      </div>

      {d.declaration && (
        <div className="mt-1.5 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-center text-[9px] font-bold tracking-wide text-amber-500">
          {d.declaration}
        </div>
      )}
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
