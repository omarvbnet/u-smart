'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { MAP_OVERLAY_MODES, type MapOverlayMode } from '../lib/engine/cable-map';
import { Map, Cable, PipetteIcon, Layers3, Cuboid, Plug } from 'lucide-react';

const MODE_META: Record<MapOverlayMode, { icon: typeof Map; labelKey: string }> = {
  plan: { icon: Map, labelKey: 'mapPlanOnly' },
  cables: { icon: Cable, labelKey: 'mapCables' },
  pipes: { icon: PipetteIcon, labelKey: 'mapPipes' },
  combined: { icon: Layers3, labelKey: 'mapCombined' },
};

export function MapOverlayToolbar() {
  const t = useT();
  const mode = useStudio((s) => s.mapOverlayMode);
  const map = useStudio((s) => s.map);
  const setMode = useStudio((s) => s.setMapOverlayMode);
  const rerouteAll = useStudio((s) => s.rerouteAllCables);
  const show3d = useStudio((s) => s.showCableRoutes3d);
  const toggle3d = useStudio((s) => s.toggleCableRoutes3d);
  const showOutlets = useStudio((s) => s.showOutletsOnMap);
  const toggleOutlets = useStudio((s) => s.toggleOutletsOnMap);
  const placeAllOutlets = useStudio((s) => s.placeRoomOutlets);
  const visualizationMode = useStudio((s) => s.visualizationMode);
  const simulating = useStudio((s) => s.simulating);

  const btn = (active: boolean) =>
    `flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
      active ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
    }`;

  const mapLabel = map?.mode === 'blank' ? t('mapTypeBlank') : map ? t('mapTypeImage') : t('mapTypeNone');
  const bottomClass = simulating ? 'bottom-48' : 'bottom-3';

  return (
    <div className={`pointer-events-auto absolute ${bottomClass} z-30 flex flex-wrap items-center gap-1.5 ltr:left-3 rtl:right-3 max-w-[calc(100%-1.5rem)]`}>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/98 p-1 shadow-lg backdrop-blur">
        <span className="px-2 text-[9px] font-semibold text-[var(--studio-muted)]">{mapLabel}</span>
        {MAP_OVERLAY_MODES.map((m) => {
          const meta = MODE_META[m];
          return (
            <button key={m} type="button" className={btn(mode === m)} onClick={() => setMode(m)} title={t(meta.labelKey)}>
              <meta.icon className="h-3.5 w-3.5" />
              <span>{t(meta.labelKey)}</span>
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[var(--studio-border)]" />
        <button type="button" className={btn(showOutlets)} onClick={toggleOutlets} title={t('showOutletsOnMap')}>
          <Plug className="h-3.5 w-3.5" />
          <span>{t('showOutletsOnMap')}</span>
        </button>
        <button type="button" className={btn(false)} onClick={() => placeAllOutlets()} title={t('autoPlaceOutlets')}>
          <Plug className="h-3.5 w-3.5 text-amber-400" />
          <span>{t('autoPlaceAllOutlets')}</span>
        </button>
        <button type="button" className={btn(false)} onClick={() => rerouteAll()} title={t('rerouteAllCables')}>
          <Cable className="h-3.5 w-3.5" />
          <span>{t('rerouteAllCables')}</span>
        </button>
        {visualizationMode === '3d' && (
          <button type="button" className={btn(show3d)} onClick={toggle3d} title={t('showCables3d')}>
            <Cuboid className="h-3.5 w-3.5" />
            <span>{t('showCables3d')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
