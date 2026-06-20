'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignWall } from '../lib/model';

export type WallNodeData = { wall: DesignWall };

function WallNodeImpl({ data }: NodeProps) {
  const { wall } = data as WallNodeData;
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;

  return (
    <div className="pointer-events-none" style={{ width: len, height: wall.thickness * 2 }}>
      <div
        className="h-full rounded-full bg-slate-600/80"
        style={{ width: len, transform: `rotate(${angle}deg)`, transformOrigin: '0 50%' }}
      />
    </div>
  );
}

export const WallNode = memo(WallNodeImpl);
