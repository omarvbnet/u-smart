'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

export type MapNodeData = {
  src: string;
  width: number;
  height: number;
  opacity: number;
};

/** Floor-plan / villa map rendered as a low-z, draggable background node. */
function MapNodeImpl({ data }: NodeProps) {
  const d = data as MapNodeData;
  return (
    <div
      className="rounded-lg border-2 border-dashed border-cyan-400/30 overflow-hidden bg-white"
      style={{ width: d.width, height: d.height, opacity: d.opacity }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.src} alt="floor plan" draggable={false} className="h-full w-full object-contain select-none" />
    </div>
  );
}

export const MapNode = memo(MapNodeImpl);
