'use client';

import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DesignOpening, CurtainStyle } from '../lib/model';

export type OpeningNodeData = {
  opening: DesignOpening;
  openPercent: number;
  selected?: boolean;
};

function curtainPaths(style: CurtainStyle, w: number, h: number, open: number): React.ReactNode {
  const t = open / 100;
  if (style === 'none') return null;
  const fabric = 'rgba(15,23,42,0.55)';
  if (style === 'roll') {
    const rollH = h * (1 - t);
    return <rect x={2} y={2} width={w - 4} height={Math.max(1, rollH)} fill={fabric} rx={1} />;
  }
  if (style === 'single') {
    const panelW = (w - 4) * (1 - t);
    return <rect x={2} y={2} width={Math.max(1, panelW)} height={h - 4} fill={fabric} rx={1} />;
  }
  const half = (w - 4) / 2;
  const inset = half * t;
  return (
    <>
      <rect x={2} y={2} width={Math.max(1, half - inset)} height={h - 4} fill={fabric} rx={1} />
      <rect x={2 + half + inset} y={2} width={Math.max(1, half - inset)} height={h - 4} fill={fabric} rx={1} />
    </>
  );
}

function OpeningNodeImpl({ data }: NodeProps) {
  const { opening, openPercent, selected } = data as OpeningNodeData;
  const isDoor = opening.kind === 'door';
  const stroke = isDoor ? '#d97706' : '#0ea5e9';
  const fill = isDoor ? 'rgba(251,191,36,0.35)' : 'rgba(56,189,248,0.25)';
  const swing = (openPercent / 100) * 90;

  return (
    <div
      className={`relative cursor-pointer transition-shadow ${selected ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-transparent rounded' : ''}`}
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
            <g transform={`rotate(${-swing} ${opening.width - 6} ${opening.height / 2})`}>
              <line
                x1={opening.width - 6}
                y1={opening.height / 2}
                x2={6}
                y2={opening.height / 2}
                stroke={stroke}
                strokeWidth={2}
              />
              <circle cx={opening.width - 6} cy={opening.height / 2} r={3} fill={stroke} />
            </g>
            <path
              d={`M ${opening.width - 4} ${opening.height - 4} A ${opening.width - 8} ${opening.width - 8} 0 0 0 4 ${opening.height - 4}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5 + openPercent / 200}
            />
          </>
        ) : (
          <>
            <line x1={4} y1={opening.height / 2} x2={opening.width - 4} y2={opening.height / 2} stroke={stroke} strokeWidth={1} />
            <line x1={opening.width / 2} y1={4} x2={opening.width / 2} y2={opening.height - 4} stroke={stroke} strokeWidth={1} />
            {curtainPaths(opening.curtainStyle ?? 'none', opening.width, opening.height, openPercent)}
          </>
        )}
      </svg>
      {opening.smartEnabled && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-fuchsia-500/80 px-1 text-[7px] font-bold uppercase text-white">
          HDL
        </span>
      )}
    </div>
  );
}

export const OpeningNode = memo(OpeningNodeImpl);
