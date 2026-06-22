'use client';

import type { SpaceDimensions } from '../lib/engine/room-dimensions';
import { formatSpaceDimensions } from '../lib/engine/room-dimensions';

type Props = {
  dims: SpaceDimensions;
  /** Show edge rulers on the plan (2D room box). */
  showEdges?: boolean;
  /** Center summary under the room title. */
  showSummary?: boolean;
  className?: string;
};

/** Architectural dimension callouts for rooms and outdoor spaces on the 2D plan. */
export function SpaceDimensionLabels({ dims, showEdges = true, showSummary = true, className = '' }: Props) {
  const w = dims.widthM.toFixed(2);
  const d = dims.depthM.toFixed(2);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      {showEdges && (
        <>
          <div className="absolute bottom-1 inset-x-6 flex items-center justify-center">
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-semibold tabular-nums text-cyan-100 backdrop-blur-sm">
              {w} m
            </span>
          </div>
          <div className="absolute top-1/2 start-1 -translate-y-1/2">
            <span
              className="inline-block origin-center -rotate-90 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-semibold tabular-nums text-cyan-100 backdrop-blur-sm"
              style={{ writingMode: 'horizontal-tb' }}
            >
              {d} m
            </span>
          </div>
        </>
      )}
      {showSummary && (
        <div className="absolute inset-x-0 top-7 px-2 text-center">
          <div className="truncate text-[8px] font-medium tabular-nums text-cyan-200/90 drop-shadow-sm">
            {formatSpaceDimensions(dims, true)}
          </div>
        </div>
      )}
    </div>
  );
}
