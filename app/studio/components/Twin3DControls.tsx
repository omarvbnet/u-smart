'use client';

import { useMemo } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { listTwin3dSpaces, collectSpaceMaterials } from '../lib/engine/twin3d-spaces';
import { Box, Layers, Eye, Home } from 'lucide-react';

export function Twin3DControls() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const rooms = useStudio((s) => s.rooms);
  const nodes = useStudio((s) => s.nodes);
  const bim = useStudio((s) => s.bim);
  const activeFloorId = useStudio((s) => s.activeFloorId);
  const focusSpaceId = useStudio((s) => s.twin3dFocusSpaceId);
  const showMaterials = useStudio((s) => s.twin3dShowMaterials);
  const setFocus = useStudio((s) => s.setTwin3dFocusSpace);
  const setShowMaterials = useStudio((s) => s.setTwin3dShowMaterials);

  const spaces = useMemo(
    () => listTwin3dSpaces(rooms, bim?.gardens, activeFloorId),
    [rooms, bim?.gardens, activeFloorId],
  );

  const materials = useMemo(() => {
    if (!showMaterials || !focusSpaceId) return [];
    return collectSpaceMaterials(focusSpaceId, rooms, bim, locale, activeFloorId, bim?.gardens, nodes);
  }, [showMaterials, focusSpaceId, rooms, bim, locale, activeFloorId, nodes]);

  const btn = (active: boolean) =>
    `flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
      active
        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
        : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
    }`;

  return (
    <div className="pointer-events-none absolute bottom-14 z-50 flex w-full flex-col items-end gap-2 px-3 ltr:right-0 rtl:left-0">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1.5 backdrop-blur">
        <span className="hidden px-1 text-[9px] font-bold uppercase tracking-wide text-[var(--studio-muted)] sm:inline">
          {t('twin3dView')}
        </span>
        <button
          type="button"
          className={btn(!focusSpaceId)}
          onClick={() => setFocus(null)}
          title={t('twin3dViewAll')}
        >
          <Home className="h-3.5 w-3.5" />
          <span>{t('twin3dViewAll')}</span>
        </button>
        <select
          value={focusSpaceId ?? ''}
          onChange={(e) => setFocus(e.target.value || null)}
          className="max-w-[9rem] rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--studio-text)] sm:max-w-[11rem]"
          title={t('twin3dFocusSpace')}
        >
          <option value="">{t('twin3dFocusSpace')}</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind === 'garden' ? `🌿 ${s.label}` : s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn(showMaterials)}
          onClick={() => setShowMaterials(!showMaterials)}
          title={t('twin3dShowMaterials')}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('twin3dShowMaterials')}</span>
        </button>
      </div>

      {showMaterials && focusSpaceId && materials.length > 0 && (
        <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-2.5 backdrop-blur">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--studio-muted)]">
            <Box className="h-3.5 w-3.5" />
            {t('twin3dMaterials')}
          </div>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {materials.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5"
              >
                <span
                  className="h-6 w-6 flex-shrink-0 rounded-md border border-white/20 shadow-inner"
                  style={{ backgroundColor: m.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-medium uppercase tracking-wide text-[var(--studio-muted)]">{m.category}</div>
                  <div className="truncate text-[11px] font-semibold text-[var(--studio-text)]">{m.label}</div>
                  <div className="truncate text-[10px] text-[var(--studio-muted)]">{m.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showMaterials && focusSpaceId && materials.length === 0 && (
        <div className="pointer-events-auto rounded-lg border border-dashed border-[var(--studio-border)] bg-[var(--studio-panel)]/90 px-3 py-2 text-[10px] text-[var(--studio-muted)]">
          <Eye className="mb-1 inline h-3.5 w-3.5" /> {t('twin3dNoMaterials')}
        </div>
      )}
    </div>
  );
}
