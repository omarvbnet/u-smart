'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { getCatalogEntry } from '../lib/catalog';
import { Lightbulb, Moon, Sun, Wind, Blinds } from 'lucide-react';

/** Simplified scene controls for client walkthrough (pre-execution approval). */
export function ClientExperienceBar() {
  const t = useT();
  const experienceMode = useStudio((s) => s.experienceMode);
  const nodes = useStudio((s) => s.nodes);
  const setControl = useStudio((s) => s.setControl);
  const execute = useStudio((s) => s.executeDesignCommand);
  const simulating = useStudio((s) => s.simulating);
  const toggleSimulation = useStudio((s) => s.toggleSimulation);

  if (experienceMode !== 'client') return null;

  const setLoads = (on: boolean, level?: number) => {
    for (const n of nodes) {
      const e = getCatalogEntry(n.catalogId);
      if (e?.domain === 'load' && e.category === 'LIGHTING') {
        setControl(n.id, 'on', on);
        if (level !== undefined) setControl(n.id, 'level', level);
      }
    }
  };

  const scene = (cmd: string) => execute(cmd);

  const btn =
    'flex flex-col items-center gap-0.5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 px-3 py-2 text-[9px] font-semibold text-[var(--studio-text)] backdrop-blur transition hover:border-cyan-400';

  return (
    <div className="absolute bottom-14 inset-x-0 z-20 flex justify-center px-2">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-[var(--studio-panel)]/95 p-2 shadow-xl backdrop-blur">
        <span className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-emerald-400">{t('clientExperienceMode')}</span>
        {!simulating && (
          <button type="button" className={btn} onClick={toggleSimulation}>
            <Sun className="h-5 w-5 text-amber-400" />
            {t('startWalkthrough')}
          </button>
        )}
        <button type="button" className={btn} onClick={() => setLoads(true, 100)}>
          <Lightbulb className="h-5 w-5 text-yellow-400" />
          {t('sceneAllLights')}
        </button>
        <button type="button" className={btn} onClick={() => scene('Good night')}>
          <Moon className="h-5 w-5 text-indigo-400" />
          {t('sceneGoodNight')}
        </button>
        <button type="button" className={btn} onClick={() => { for (const n of nodes) { const e = getCatalogEntry(n.catalogId); if (e?.domain === 'smarthome' && e.deviceClass.toLowerCase().includes('curtain')) setControl(n.id, 'level', 100); } }}>
          <Blinds className="h-5 w-5 text-cyan-400" />
          {t('sceneOpenCurtains')}
        </button>
        <button type="button" className={btn} onClick={() => { for (const n of nodes) { const e = getCatalogEntry(n.catalogId); if (e?.domain === 'hvac') setControl(n.id, 'on', true); } }}>
          <Wind className="h-5 w-5 text-sky-400" />
          {t('sceneHvacOn')}
        </button>
      </div>
    </div>
  );
}
