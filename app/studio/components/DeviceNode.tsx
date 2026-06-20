'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCatalogEntry, type ComponentPort, type PortKind } from '../lib/catalog';
import { engineeringSymbolFor } from '../lib/catalog/symbols';
import { footprintPx, physicalSpecFor } from '../lib/catalog/dimensions';
import { useStudio } from '../lib/store';
import { EntryImage } from './EntryImage';
import { EngineeringSymbol } from './EngineeringSymbol';
import { NodeHoverCard } from './NodeHoverCard';
import type { Severity } from '../lib/engine/validation';

export type DeviceNodeData = {
  nodeId: string;
  catalogId: string;
  label: string;
  severity: Severity | null;
  rtl: boolean;
  declaration: string | null;
  energised: boolean;
  active: boolean;
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-orange-400',
  recommendation: 'bg-blue-400',
};

export const PORT_COLOR: Record<PortKind, string> = {
  power: '#f59e0b',
  bus: '#22c55e',
  signal: '#3b82f6',
  control: '#a855f7',
};

type Placed = { port: ComponentPort; side: 'lead' | 'trail'; topPct: number };

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
  const visualizationMode = useStudio((s) => s.visualizationMode);
  const experienceMode = useStudio((s) => s.experienceMode);

  if (!entry) {
    return <div className="rounded-lg border border-dashed border-orange-400 px-2 py-1 text-[9px] text-orange-400">?</div>;
  }

  const leadPos = d.rtl ? Position.Right : Position.Left;
  const trailPos = d.rtl ? Position.Left : Position.Right;
  const placed = layoutPorts(entry.ports);
  const phys = physicalSpecFor(entry);
  const fp = footprintPx(phys);
  const symbol = engineeringSymbolFor(entry);
  const live = simulating && d.active;
  const showLabel = experienceMode === 'client' || visualizationMode === 'product';

  const body = (() => {
    if (visualizationMode === 'product') {
      return (
        <div
          className={`relative flex flex-col items-center justify-center rounded-md border-2 bg-[var(--studio-node)] transition
            ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-[var(--studio-border)]'}
            ${live && entry.domain === 'load' && entry.category === 'LIGHTING' ? 'shadow-[0_0_24px_rgba(253,224,71,0.55)]' : ''}`}
          style={{ width: fp.w, height: fp.h, borderColor: selected ? undefined : entry.color }}
        >
          <EntryImage entry={entry} className="h-[70%] w-[70%] max-h-12 max-w-12" />
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] text-[var(--studio-muted)]">
            {phys.widthMm}×{phys.heightMm} mm
          </div>
          {live && entry.domain === 'load' && entry.category === 'LIGHTING' && (
            <div className="pointer-events-none absolute inset-0 rounded-md bg-yellow-300/20" />
          )}
        </div>
      );
    }

    return (
      <EngineeringSymbol
        symbol={symbol}
        color={entry.color}
        size={entry.domain === 'source' || entry.domain === 'hvac' ? 52 : 44}
        selected={selected}
        active={live}
        label={showLabel ? d.label : undefined}
      />
    );
  })();

  return (
    <div className="group relative">
      {placed.map((p) => (
        <Handle
          key={`${p.side}-${p.port.id}`}
          type={p.side === 'lead' ? 'target' : 'source'}
          id={p.port.id}
          position={p.side === 'lead' ? leadPos : trailPos}
          style={{ top: `${p.topPct}%`, background: PORT_COLOR[p.port.kind], borderColor: 'var(--studio-bg)' }}
          className="!h-2.5 !w-2.5 !border-2"
          title={p.port.label[d.rtl ? 'ar' : 'en']}
        />
      ))}

      {d.severity && experienceMode === 'engineer' && (
        <span className={`absolute -top-1 ${d.rtl ? '-left-1' : '-right-1'} h-2.5 w-2.5 rounded-full ${SEVERITY_DOT[d.severity]} ring-1 ring-[var(--studio-bg)]`} />
      )}

      {simulating && (
        <span
          className={`absolute -top-1 ${d.rtl ? '-right-1' : '-left-1'} rounded-full px-1 py-px text-[7px] font-bold ring-1 ring-[var(--studio-bg)]
            ${d.active ? 'bg-emerald-500 text-white' : d.energised ? 'bg-amber-500 text-white' : 'bg-zinc-500 text-white'}`}
        >
          {d.active ? 'ON' : d.energised ? '~' : '·'}
        </span>
      )}

      {body}

      {d.declaration && experienceMode === 'engineer' && (
        <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded bg-amber-400/90 px-1 py-px text-[7px] font-bold text-amber-950">
          {d.declaration}
        </div>
      )}

      {experienceMode === 'engineer' && (
        <NodeHoverCard nodeId={d.nodeId} catalogId={d.catalogId} label={d.label} />
      )}
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
