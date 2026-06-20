'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignOpening } from '../lib/model';

export type OpeningNodeData = { opening: DesignOpening };

function OpeningNodeImpl({ data }: NodeProps) {
  const { opening } = data as OpeningNodeData;
  const isDoor = opening.kind === 'door';
  const stroke = isDoor ? '#d97706' : '#0ea5e9';
  const fill = isDoor ? 'rgba(251,191,36,0.35)' : 'rgba(56,189,248,0.25)';

  return (
    <div
      className="pointer-events-none relative"
      style={{
        width: opening.width,
        height: opening.height,
        transform: opening.rotation ? `rotate(${opening.rotation}deg)` : undefined,
      }}
      title={opening.kind}
    >
      <svg width={opening.width} height={opening.height} className="overflow-visible">
        <rect x={1} y={1} width={opening.width - 2} height={opening.height - 2} fill={fill} stroke={stroke} strokeWidth={2} rx={2} />
        {isDoor ? (
          <>
            <path
              d={`M ${opening.width - 4} ${opening.height - 4} A ${opening.width - 8} ${opening.width - 8} 0 0 0 4 ${opening.height - 4}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle cx={opening.width - 6} cy={opening.height / 2} r={2} fill={stroke} />
          </>
        ) : (
          <>
            <line x1={4} y1={opening.height / 2} x2={opening.width - 4} y2={opening.height / 2} stroke={stroke} strokeWidth={1} />
            <line x1={opening.width / 2} y1={4} x2={opening.width / 2} y2={opening.height - 4} stroke={stroke} strokeWidth={1} />
          </>
        )}
      </svg>
    </div>
  );
}

export const OpeningNode = memo(OpeningNodeImpl);
