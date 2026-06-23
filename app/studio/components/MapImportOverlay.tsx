'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useStudio, type MapImportPhase } from '../lib/store';
import { useT } from './hooks';

const STEPS = [
  { phase: 'reading' as const, key: 'mapImportReading' as const },
  { phase: 'detecting-rooms' as const, key: 'mapImportDetectRooms' as const },
  { phase: 'detecting-walls' as const, key: 'mapImportDetectWalls' as const },
  { phase: 'generating' as const, key: 'mapImportGenerating' as const },
];

const ORDER: MapImportPhase[] = ['reading', 'detecting-rooms', 'detecting-walls', 'generating', 'done'];

function stepIndex(phase: MapImportPhase): number {
  if (phase === 'done') return ORDER.length;
  if (phase === 'error' || phase === 'idle') return -1;
  return ORDER.indexOf(phase);
}

export function MapImportOverlay() {
  const t = useT();
  const phase = useStudio((s) => s.mapImportPhase);
  const detail = useStudio((s) => s.mapImportDetail);
  const generatingProject = useStudio((s) => s.generatingProject);
  const canvasBooting = useStudio((s) => s.canvasBooting);

  const importActive = phase !== 'idle';
  const busy = generatingProject || canvasBooting || importActive;
  if (!busy) return null;

  if (!importActive) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] px-8 py-6 shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm font-semibold text-[var(--studio-text)]">
            {generatingProject ? t('generatingProject') : t('openingPlan')}
          </p>
          <p className="max-w-xs text-center text-xs text-[var(--studio-muted)]">
            {generatingProject ? t('generatingProjectHint') : t('openingPlanHint')}
          </p>
        </div>
      </div>
    );
  }

  const activeIdx = stepIndex(phase);
  const isError = phase === 'error';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] px-6 py-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          {isError ? (
            <span className="text-sm font-bold text-red-400">{t('mapImportError')}</span>
          ) : phase === 'done' ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-300">{t('mapImportDone')}</span>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
              <span className="text-sm font-bold text-[var(--studio-text)]">{t('openingPlan')}</span>
            </>
          )}
        </div>

        {detail && <p className="mb-3 truncate text-[11px] text-[var(--studio-muted)]">{detail}</p>}

        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const done = activeIdx > i || phase === 'done';
            const active = ORDER[i] === phase;
            return (
              <li key={step.phase} className="flex items-center gap-2.5 text-xs">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-cyan-400" />
                ) : (
                  <Circle className="h-4 w-4 flex-shrink-0 text-[var(--studio-border)]" />
                )}
                <span
                  className={
                    done ? 'text-emerald-300' : active ? 'font-semibold text-cyan-200' : 'text-[var(--studio-muted)]'
                  }
                >
                  {t(step.key)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
