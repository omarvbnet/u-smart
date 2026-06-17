'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

export type MapNodeData = {
  src: string;
  width: number;
  height: number;
  opacity: number;
  mode?: 'blank' | 'image';
};

/** Floor-plan / villa map rendered as a low-z, draggable background node. */
function MapNodeImpl({ data }: NodeProps) {
  const d = data as MapNodeData;
  const blank = d.mode === 'blank';
  return (
    <div
      className={`rounded-lg border-2 overflow-hidden ${blank ? 'border-cyan-400/50 bg-slate-100' : 'border-dashed border-cyan-400/30 bg-white'}`}
      style={{ width: d.width, height: d.height, opacity: d.opacity }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.src} alt="floor plan" draggable={false} className="h-full w-full object-fill select-none" />
    </div>
  );
}

export const MapNode = memo(MapNodeImpl);
