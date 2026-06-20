'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { ConduitType, MapOverlayMode } from '../lib/engine/cable-map';
import { CONDUIT_STYLE } from '../lib/engine/cable-map';
import { getCatalogEntry, type CableSpec } from '../lib/catalog';
import type { Severity } from '../lib/engine/validation';

export type CableRouteNodeData = {
  cableId: string;
  catalogId: string;
  label: string;
  points: { x: number; y: number }[];
  width: number;
  height: number;
  conduitType: ConduitType;
  overlayMode: MapOverlayMode;
  selected: boolean;
  editing: boolean;
  severity: Severity | null;
  energised: boolean;
  active: boolean;
  lengthM: number;
};

const SEVERITY_STROKE: Record<Severity, string> = {
  critical: '#ef4444',
  warning: '#fb923c',
  recommendation: '#60a5fa',
};

function CableRouteNodeImpl({ data, selected }: NodeProps) {
  const d = data as CableRouteNodeData;
  const entry = getCatalogEntry(d.catalogId) as CableSpec | undefined;
  const cableColor = entry?.color ?? '#f59e0b';
  const stroke = d.severity ? SEVERITY_STROKE[d.severity] : cableColor;
  const live = d.active;
  const style = CONDUIT_STYLE[d.conduitType] ?? CONDUIT_STYLE.conduit;
  const showPipe = d.overlayMode === 'pipes' || d.overlayMode === 'combined';
  const showCable = d.overlayMode === 'cables' || d.overlayMode === 'combined';
  const pts = d.points;
  if (pts.length < 2) return null;

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="pointer-events-none relative" style={{ width: d.width, height: d.height }}>
      <svg width={d.width} height={d.height} className="overflow-visible">
        {showPipe && (
          <path
            d={pathD}
            fill="none"
            stroke={style.color}
            strokeWidth={style.outerPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={style.dash}
            opacity={0.85}
          />
        )}
        {showPipe && style.fill && (
          <path d={pathD} fill="none" stroke={style.fill} strokeWidth={style.outerPx - 3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {showCable && (
          <path
            d={pathD}
            fill="none"
            stroke={live ? '#22c55e' : stroke}
            strokeWidth={selected || d.selected ? 4 : 3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {(selected || d.selected) && (
          <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.9} />
        )}
        {d.editing &&
          pts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={6}
              fill="#22d3ee"
              stroke="#0e7490"
              strokeWidth={2}
              className="pointer-events-auto cursor-grab"
            />
          ))}
      </svg>
      <div
        className="pointer-events-auto absolute"
        style={{
          left: pts[Math.floor(pts.length / 2)]!.x - 40,
          top: pts[Math.floor(pts.length / 2)]!.y - 10,
          width: 80,
          height: 20,
        }}
        title={`${d.label} · ${d.lengthM} m · ${style.label}`}
      />
    </div>
  );
}

export const CableRouteNode = memo(CableRouteNodeImpl);
