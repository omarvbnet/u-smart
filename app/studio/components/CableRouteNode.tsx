'use client';

import { memo, useRef, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { ConduitType, MapOverlayMode } from '../lib/engine/cable-map';
import { CONDUIT_STYLE, toWorldPoints } from '../lib/engine/cable-map';
import { getCatalogEntry, type CableSpec } from '../lib/catalog';
import type { Severity } from '../lib/engine/validation';
import { useStudio } from '../lib/store';

export type CableRouteNodeData = {
  cableId: string;
  catalogId: string;
  label: string;
  cableLabel?: string;
  points: { x: number; y: number }[];
  worldOrigin: { x: number; y: number };
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
  const updateCableRoutePoints = useStudio((s) => s.updateCableRoutePoints);
  const dragRef = useRef<{ idx: number; start: { x: number; y: number }; origin: { x: number; y: number } } | null>(null);

  const onHandleDown = useCallback(
    (idx: number) => (e: React.PointerEvent) => {
      if (!d.editing) return;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = { idx, start: { x: e.clientX, y: e.clientY }, origin: { ...pts[idx]! } };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [d.editing, pts],
  );

  const onHandleMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.start.x;
      const dy = e.clientY - drag.start.y;
      const next = pts.map((p, i) => (i === drag.idx ? { x: drag.origin.x + dx, y: drag.origin.y + dy } : p));
      const world = toWorldPoints(next, d.worldOrigin);
      updateCableRoutePoints(d.cableId, world);
    },
    [d.cableId, d.worldOrigin, pts, updateCableRoutePoints],
  );

  const onHandleUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (pts.length < 2) return null;

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const mid = pts[Math.floor(pts.length / 2)]!;
  const displayLabel = d.cableLabel ?? d.label;

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
        {showCable && displayLabel && (
          <>
            <rect x={mid.x - 52} y={mid.y - 18} width={104} height={16} rx={3} fill="rgba(15,23,42,0.85)" />
            <text x={mid.x} y={mid.y - 6} textAnchor="middle" fill="#e2e8f0" fontSize={8} fontWeight={600}>
              {displayLabel.length > 22 ? `${displayLabel.slice(0, 20)}…` : displayLabel}
            </text>
            <text x={mid.x} y={mid.y + 6} textAnchor="middle" fill="#94a3b8" fontSize={7}>
              {d.lengthM}m · {style.label}
            </text>
          </>
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
              onPointerDown={onHandleDown(i)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
            />
          ))}
      </svg>
    </div>
  );
}

export const CableRouteNode = memo(CableRouteNodeImpl);
