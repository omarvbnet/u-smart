'use client';

import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { DesignRoom } from '../lib/model';
import type { RoomLuxHeatmap } from '../lib/engine/lux-heatmap';
import { luxColor } from '../lib/engine/lux-heatmap';
import type { RoomLoadHeatmap } from '../lib/engine/load-heatmap';
import { loadHeatColor } from '../lib/engine/load-heatmap';

export type RoomNodeData = {
  room: DesignRoom;
  selected: boolean;
  areaM2: number;
  luxHeatmap?: RoomLuxHeatmap | null;
  loadHeatmap?: RoomLoadHeatmap | null;
  outletCount?: number;
  vrfUnitCount?: number;
};

function RoomNodeImpl({ data, selected }: NodeProps) {
  const d = data as RoomNodeData;
  const { room, areaM2, luxHeatmap, loadHeatmap, outletCount, vrfUnitCount } = d;

  return (
    <>
      <NodeResizer
        minWidth={80}
        minHeight={60}
        isVisible={selected}
        lineClassName="!border-cyan-400"
        handleClassName="!h-2.5 !w-2.5 !border-cyan-400 !bg-cyan-400"
      />
      <div
        className={`relative h-full w-full rounded-lg border-2 border-dashed transition
          ${selected ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-500/60 bg-slate-500/5'}`}
        style={{ minWidth: room.width, minHeight: room.height }}
      >
        {loadHeatmap && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {loadHeatmap.cells.map((c, i) => (
              <div
                key={`l${i}`}
                className="absolute rounded-sm"
                style={{
                  left: c.x,
                  top: c.y,
                  width: Math.max(6, room.width / 8 - 2),
                  height: Math.max(6, room.height / 8 - 2),
                  background: loadHeatColor(c.wPerM2, loadHeatmap.targetWPerM2),
                }}
              />
            ))}
            <div className="absolute bottom-8 inset-x-0 text-center text-[8px] font-semibold text-orange-300 drop-shadow">
              {loadHeatmap.averageWPerM2}/{loadHeatmap.targetWPerM2} W/m²
            </div>
          </div>
        )}
        {luxHeatmap && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {luxHeatmap.cells.map((c, i) => (
              <div
                key={i}
                className="absolute rounded-sm"
                style={{
                  left: c.x,
                  top: c.y,
                  width: Math.max(6, room.width / 8 - 2),
                  height: Math.max(6, room.height / 8 - 2),
                  background: luxColor(c.lux, luxHeatmap.targetLux),
                }}
              />
            ))}
            <div className="absolute bottom-8 inset-x-0 text-center text-[8px] font-semibold text-emerald-300 drop-shadow">
              {luxHeatmap.achievedLux}/{luxHeatmap.targetLux} lx
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-2 px-2 text-center">
          <div className="truncate text-xs font-bold text-[var(--studio-text)]">{room.label}</div>
          <div className="text-[9px] text-[var(--studio-muted)]">{areaM2.toFixed(1)} m²</div>
        </div>
        <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-2 text-[8px] uppercase tracking-wider text-[var(--studio-muted)] opacity-70">
          <span>{room.zone}</span>
          {(outletCount ?? 0) > 0 && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300 normal-case">
              {outletCount} sockets
            </span>
          )}
          {(vrfUnitCount ?? 0) > 0 && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-300 normal-case">
              {vrfUnitCount} VRF
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export const RoomNode = memo(RoomNodeImpl);
