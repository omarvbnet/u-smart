'use client';

import { memo } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { DesignRoom } from '../lib/model';

export type RoomNodeData = {
  room: DesignRoom;
  selected: boolean;
  areaM2: number;
};

function RoomNodeImpl({ data, selected }: NodeProps) {
  const d = data as RoomNodeData;
  const { room, areaM2 } = d;

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
        <div className="absolute inset-x-0 top-2 px-2 text-center">
          <div className="truncate text-xs font-bold text-[var(--studio-text)]">{room.label}</div>
          <div className="text-[9px] text-[var(--studio-muted)]">{areaM2.toFixed(1)} m²</div>
        </div>
        <div className="absolute bottom-1.5 inset-x-0 text-center text-[8px] uppercase tracking-wider text-[var(--studio-muted)] opacity-70">
          {room.zone}
        </div>
      </div>
    </>
  );
}

export const RoomNode = memo(RoomNodeImpl);
