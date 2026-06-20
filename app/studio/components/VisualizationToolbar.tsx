'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import type { VisualizationMode } from '../lib/visualization/modes';
import { Ruler, Box, Cuboid, Users, Wrench, SunMedium, Zap } from 'lucide-react';

const MODES: { id: VisualizationMode; icon: typeof Ruler; labelKey: string }[] = [
  { id: 'engineering', icon: Ruler, labelKey: 'vizEngineering' },
  { id: 'product', icon: Box, labelKey: 'vizProduct' },
  { id: '3d', icon: Cuboid, labelKey: 'viz3d' },
];

export function VisualizationToolbar() {
  const t = useT();
  const mode = useStudio((s) => s.visualizationMode);
  const experienceMode = useStudio((s) => s.experienceMode);
  const setMode = useStudio((s) => s.setVisualizationMode);
  const toggleExperience = useStudio((s) => s.toggleExperienceMode);
  const showLux = useStudio((s) => s.showLuxHeatmap);
  const toggleLux = useStudio((s) => s.toggleLuxHeatmap);
  const showLoad = useStudio((s) => s.showLoadHeatmap);
  const toggleLoad = useStudio((s) => s.toggleLoadHeatmap);

  const btn = (active: boolean) =>
    `flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition ${
      active ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300' : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
    }`;

  return (
    <div className="absolute top-3 z-10 flex flex-wrap items-center gap-1.5 ltr:right-3 rtl:left-3 max-w-[calc(100%-1.5rem)]">
      <div className="flex items-center gap-1 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-1 backdrop-blur">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={btn(mode === m.id)}
            onClick={() => setMode(m.id)}
            title={t(m.labelKey)}
          >
            <m.icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t(m.labelKey)}</span>
          </button>
        ))}
      </div>
      <button className={btn(showLux)} onClick={toggleLux} title={t('luxHeatmap')}>
        <SunMedium className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{t('luxHeatmap')}</span>
      </button>
      <button className={btn(showLoad)} onClick={toggleLoad} title={t('loadHeatmap')}>
        <Zap className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{t('loadHeatmap')}</span>
      </button>
      <button
        className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold backdrop-blur transition ${
          experienceMode === 'client'
            ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
            : 'border-[var(--studio-border)] bg-[var(--studio-panel)]/95 text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
        }`}
        onClick={toggleExperience}
        title={t(experienceMode === 'client' ? 'engineerMode' : 'clientExperienceMode')}
      >
        {experienceMode === 'client' ? <Users className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{experienceMode === 'client' ? t('clientExperienceMode') : t('engineerMode')}</span>
      </button>
    </div>
  );
}
