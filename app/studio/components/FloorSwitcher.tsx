'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { Layers, Plus, Trash2 } from 'lucide-react';

export function FloorSwitcher() {
  const t = useT();
  const floors = useStudio((s) => s.floors);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const switchFloor = useStudio((s) => s.switchFloor);
  const addFloor = useStudio((s) => s.addFloor);
  const removeFloor = useStudio((s) => s.removeFloor);

  if (floors.length <= 1 && floors[0]?.level === 0) {
    return (
      <div className="flex items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1 backdrop-blur">
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-semibold text-[var(--studio-muted)] hover:text-[var(--studio-text)]"
          onClick={() => addFloor()}
          title={t('addFloor')}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('addFloor')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1 backdrop-blur">
      <Layers className="mx-1 h-3.5 w-3.5 text-[var(--studio-muted)]" />
      {floors.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`rounded-lg px-2 py-1 text-[9px] font-semibold transition ${
            f.id === activeFloorId
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-[var(--studio-muted)] hover:bg-[var(--studio-hover)] hover:text-[var(--studio-text)]'
          }`}
          onClick={() => switchFloor(f.id)}
        >
          {f.label}
        </button>
      ))}
      <button
        type="button"
        className="rounded-lg p-1 text-[var(--studio-muted)] hover:text-cyan-300"
        onClick={() => addFloor()}
        title={t('addFloor')}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {floors.length > 1 && (
        <button
          type="button"
          className="rounded-lg p-1 text-red-400/80 hover:text-red-400"
          onClick={() => removeFloor(activeFloorId)}
          title={t('removeFloor')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
