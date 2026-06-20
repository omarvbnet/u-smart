'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignGarden } from '../lib/model';

export type GardenNodeData = { garden: DesignGarden };

function GardenNodeImpl({ data }: NodeProps) {
  const { garden } = data as GardenNodeData;

  return (
    <div
      className="pointer-events-none rounded-lg border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-400/25 to-lime-500/15"
      style={{ width: garden.width, height: garden.height }}
      title={garden.label}
    >
      <div className="flex h-full items-center justify-center text-[9px] font-semibold text-emerald-700/80">
        {garden.label}
      </div>
    </div>
  );
}

export const GardenNode = memo(GardenNodeImpl);
