'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignWall } from '../lib/model';

export type WallNodeData = { wall: DesignWall; selected?: boolean };

function WallNodeImpl({ data }: NodeProps) {
  const { wall, selected } = data as WallNodeData;
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
  const outdoor = wall.outdoor;
  const barColor = outdoor ? 'bg-emerald-500/75' : 'bg-slate-500/70';
  const ring = selected ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-transparent' : '';

  return (
    <div
      className={`cursor-pointer ${ring}`}
      style={{ width: len, height: Math.max(wall.thickness * 2, 8) }}
    >
      <div
        className={`h-full rounded-full ${barColor} ${outdoor ? 'shadow-[0_0_8px_rgba(16,185,129,0.35)]' : ''}`}
        style={{ width: len, transform: `rotate(${angle}deg)`, transformOrigin: '0 50%' }}
      />
      {outdoor && (
        <span className="pointer-events-none absolute -top-3 left-0 text-[7px] font-bold uppercase tracking-wide text-emerald-300/90">
          ext
        </span>
      )}
    </div>
  );
}

export const WallNode = memo(WallNodeImpl);
