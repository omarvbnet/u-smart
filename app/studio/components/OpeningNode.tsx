'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignOpening } from '../lib/model';

export type OpeningNodeData = { opening: DesignOpening };

function OpeningNodeImpl({ data }: NodeProps) {
  const { opening } = data as OpeningNodeData;
  const color = opening.kind === 'door' ? 'border-amber-500 bg-amber-500/30' : 'border-sky-500 bg-sky-500/30';

  return (
    <div
      className={`pointer-events-none rounded border-2 ${color}`}
      style={{
        width: opening.width,
        height: opening.height,
        transform: opening.rotation ? `rotate(${opening.rotation}deg)` : undefined,
      }}
      title={opening.kind}
    />
  );
}

export const OpeningNode = memo(OpeningNodeImpl);
