'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getCatalogEntry, type ComponentPort, type PortKind } from '../lib/catalog';
import { useStudio } from '../lib/store';
import { EntryImage } from './EntryImage';
import { Icon } from './lucide-icon';
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

const SEVERITY_RING: Record<Severity, string> = {
  critical: 'ring-2 ring-red-500',
  warning: 'ring-2 ring-orange-400',
  recommendation: 'ring-2 ring-blue-400',
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

function ProtectionShape({ entry, label, selected, severity, simulating, active }: {
  entry: ReturnType<typeof getCatalogEntry>;
  label: string;
  selected: boolean;
  severity: Severity | null;
  simulating: boolean;
  active: boolean;
}) {
  if (!entry) return null;
  return (
    <div
      className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg border-2 bg-[var(--studio-node)] transition
        ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : severity ? SEVERITY_RING[severity] : 'border-[var(--studio-border)]'}
        ${simulating && active ? 'shadow-[0_0_12px_rgba(34,211,238,0.5)]' : ''}`}
      style={{ borderColor: selected ? undefined : entry.color }}
    >
      <Icon name={entry.icon} className="h-5 w-5" style={{ color: entry.color }} />
      <span className="mt-0.5 max-w-[40px] truncate text-[7px] font-bold text-[var(--studio-text)]">{label}</span>
    </div>
  );
}

function LoadShape({ entry, label, selected, severity, simulating, active }: {
  entry: ReturnType<typeof getCatalogEntry>;
  label: string;
  selected: boolean;
  severity: Severity | null;
  simulating: boolean;
  active: boolean;
}) {
  if (!entry) return null;
  return (
    <div
      className={`flex h-10 w-10 flex-col items-center justify-center rounded-full border-2 bg-[var(--studio-node)] transition
        ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : severity ? SEVERITY_RING[severity] : 'border-[var(--studio-border)]'}
        ${simulating && active ? 'bg-emerald-500/20 border-emerald-400' : ''}`}
      style={{ borderColor: selected ? undefined : entry.color }}
    >
      <Icon name={entry.icon} className="h-4 w-4" style={{ color: entry.color }} />
    </div>
  );
}

function SourceShape({ entry, label, selected }: {
  entry: ReturnType<typeof getCatalogEntry>;
  label: string;
  selected: boolean;
}) {
  if (!entry) return null;
  return (
    <div
      className={`flex h-[52px] w-[68px] flex-col items-center justify-center rounded-md border-2 bg-[var(--studio-node)] px-1 transition
        ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-[var(--studio-border)]'}`}
      style={{ borderColor: selected ? undefined : entry.color }}
    >
      <EntryImage entry={entry} className="h-7 w-7" />
      <span className="mt-0.5 max-w-full truncate text-[7px] font-bold text-[var(--studio-text)]">{label}</span>
    </div>
  );
}

function HvacShape({ entry, label, selected, simulating, active }: {
  entry: ReturnType<typeof getCatalogEntry>;
  label: string;
  selected: boolean;
  simulating: boolean;
  active: boolean;
}) {
  if (!entry) return null;
  return (
    <div
      className={`flex h-16 w-[84px] flex-col items-center justify-center rounded-lg border-2 bg-[var(--studio-node)] transition
        ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-[var(--studio-border)]'}
        ${simulating && active ? 'shadow-[0_0_14px_rgba(34,211,238,0.4)]' : ''}`}
      style={{ borderColor: selected ? undefined : entry.color }}
    >
      <EntryImage entry={entry} className="h-9 w-9" />
      <span className="mt-0.5 max-w-full truncate text-[8px] font-semibold text-[var(--studio-text)]">{label}</span>
    </div>
  );
}

function CompactShape({ entry, selected }: {
  entry: ReturnType<typeof getCatalogEntry>;
  selected: boolean;
}) {
  if (!entry) return null;
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[var(--studio-node)] transition
        ${selected ? 'border-cyan-400' : 'border-[var(--studio-border)]'}`}
      style={{ borderColor: selected ? undefined : entry.color }}
    >
      <Icon name={entry.icon} className="h-4 w-4" style={{ color: entry.color }} />
    </div>
  );
}

function DeviceNodeImpl({ data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  const entry = getCatalogEntry(d.catalogId);
  const simulating = useStudio((s) => s.simulating);

  if (!entry) {
    return (
      <div className="w-20 rounded-lg border border-dashed border-orange-400 bg-[var(--studio-node)] px-2 py-1 text-[9px] text-orange-400">
        ?
      </div>
    );
  }

  const leadPos = d.rtl ? Position.Right : Position.Left;
  const trailPos = d.rtl ? Position.Left : Position.Right;
  const placed = layoutPorts(entry.ports);

  const body = (() => {
    switch (entry.domain) {
      case 'protection':
        return <ProtectionShape entry={entry} label={d.label} selected={selected} severity={d.severity} simulating={simulating} active={d.active} />;
      case 'load':
        return <LoadShape entry={entry} label={d.label} selected={selected} severity={d.severity} simulating={simulating} active={d.active} />;
      case 'source':
        return <SourceShape entry={entry} label={d.label} selected={selected} />;
      case 'hvac':
        return <HvacShape entry={entry} label={d.label} selected={selected} simulating={simulating} active={d.active} />;
      case 'sensor':
      case 'smarthome':
        return <CompactShape entry={entry} selected={selected} />;
      default:
        return (
          <div className={`rounded-lg border bg-[var(--studio-node)] px-2 py-1.5 ${selected ? 'border-cyan-400' : 'border-[var(--studio-border)]'}`}>
            <div className="truncate text-[10px] font-semibold text-[var(--studio-text)]">{d.label}</div>
          </div>
        );
    }
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

      {d.severity && (
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

      {d.declaration && (
        <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded bg-amber-400/90 px-1 py-px text-[7px] font-bold text-amber-950">
          {d.declaration}
        </div>
      )}

      <NodeHoverCard nodeId={d.nodeId} catalogId={d.catalogId} label={d.label} />
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeImpl);
