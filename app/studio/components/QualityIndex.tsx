'use client';

import { useStudio } from '../lib/store';
import { useAnalysis, useT } from './hooks';

function scoreColor(v: number): string {
  if (v >= 85) return '#22c55e';
  if (v >= 65) return '#eab308';
  if (v >= 40) return '#f97316';
  return '#ef4444';
}

export function QualityIndex() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const { quality, compliance } = useAnalysis();
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (quality.overall / 100) * c;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--studio-border)] p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('quality')}</h2>
        <div className="flex items-center gap-4">
          <div className="relative h-[68px] w-[68px] flex-shrink-0">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
              <circle cx="32" cy="32" r={r} fill="none" stroke="var(--studio-border)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r={r} fill="none"
                stroke={scoreColor(quality.overall)} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${dash} ${c}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-[var(--studio-text)]">{quality.overall}</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {quality.factors.map((f) => (
              <div key={f.key}>
                <div className="mb-0.5 flex items-center justify-between text-[10px]">
                  <span className="text-[var(--studio-muted)]">{f.label[locale]}</span>
                  <span className="font-semibold text-[var(--studio-text)]">{f.score}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--studio-border)]">
                  <div className="h-full rounded-full" style={{ width: `${f.score}%`, backgroundColor: scoreColor(f.score) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('compliance')}</h2>
        <div className="space-y-2">
          {compliance.map((row) => (
            <div key={row.standard}>
              <div className="mb-0.5 flex items-center justify-between text-[11px]">
                <span className="truncate text-[var(--studio-text)]">{row.label[locale]}</span>
                <span className="font-semibold" style={{ color: scoreColor(row.percent) }}>{row.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--studio-border)]">
                <div className="h-full rounded-full transition-all" style={{ width: `${row.percent}%`, backgroundColor: scoreColor(row.percent) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
