'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignGarden } from '../lib/model';
import { gardenDimensions } from '../lib/engine/room-dimensions';
import { SpaceDimensionLabels } from './SpaceDimensionLabels';

export type GardenNodeData = { garden: DesignGarden; showDimensions?: boolean };

function GardenNodeImpl({ data }: NodeProps) {
  const { garden, showDimensions } = data as GardenNodeData;
  const dims = gardenDimensions(garden);

  return (
    <div
      className="relative pointer-events-none rounded-lg border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-400/25 to-lime-500/15"
      style={{ width: garden.width, height: garden.height }}
    >
      {showDimensions && <SpaceDimensionLabels dims={dims} />}
      <div className="flex h-full flex-col items-center justify-center gap-0.5 px-2 text-center">
        <div className="text-[9px] font-semibold text-emerald-700/90">{garden.label}</div>
        {showDimensions && (
          <div className="text-[8px] font-medium tabular-nums text-emerald-800/70">{dims.areaM2.toFixed(1)} m²</div>
        )}
      </div>
    </div>
  );
}

export const GardenNode = memo(GardenNodeImpl);
