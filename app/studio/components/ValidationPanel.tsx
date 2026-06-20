'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '../lib/store';
import { useAnalysis, useT } from './hooks';
import type { Issue, Severity } from '../lib/engine/validation';
import { CheckCircle2, ChevronRight, Wrench, AlertOctagon, AlertTriangle, Lightbulb } from 'lucide-react';

const SEVERITY_META: Record<Severity, { color: string; bg: string; border: string; icon: typeof AlertOctagon }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertOctagon },
  warning: { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30', icon: AlertTriangle },
  recommendation: { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30', icon: Lightbulb },
};

function IssueCard({
  issue,
  onFixed,
  onFailed,
}: {
  issue: Issue;
  onFixed: () => void;
  onFailed: () => void;
}) {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const select = useStudio((s) => s.select);
  const applyFix = useStudio((s) => s.applyFix);
  const [open, setOpen] = useState(issue.severity === 'critical');
  const [busy, setBusy] = useState(false);
  const meta = SEVERITY_META[issue.severity];

  const runFix = () => {
    if (!issue.fix || busy) return;
    setBusy(true);
    const ok = applyFix(issue.fix);
    setBusy(false);
    if (ok) onFixed();
    else onFailed();
  };

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg}`}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (issue.nodeId) select(issue.nodeId);
        }}
        className="flex w-full items-start gap-2 p-2.5 text-start"
      >
        <meta.icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.color}`} />
        <span className="flex-1 text-xs font-semibold text-[var(--studio-text)]">{issue.title[locale]}</span>
        <ChevronRight className={`h-4 w-4 flex-shrink-0 text-[var(--studio-muted)] transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2.5 px-2.5 pb-2.5">
          <p className="text-[11px] leading-relaxed text-[var(--studio-muted)]">{issue.detail[locale]}</p>

          {issue.values.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {issue.values.map((v, i) => (
                <div key={i} className="rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1">
                  <div className="text-[9px] text-[var(--studio-muted)]">{v.label[locale]}</div>
                  <div className="text-[11px] font-semibold text-[var(--studio-text)]">{v.value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5">
            <div className="text-[9px] font-medium uppercase tracking-wide text-[var(--studio-muted)]">{t('recommendedActions')}</div>
            <div className="text-[11px] text-[var(--studio-text)]">{issue.recommendation[locale]}</div>
          </div>

          {issue.standards.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.standards.map((s) => (
                <span key={s} className="rounded bg-[var(--studio-hover)] px-1.5 py-0.5 text-[9px] text-[var(--studio-muted)]">{s}</span>
              ))}
            </div>
          )}

          {issue.fix && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                runFix();
              }}
              className="flex items-center gap-1.5 rounded-md bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-400 disabled:opacity-70"
            >
              <Wrench className="h-3.5 w-3.5" />
              {busy ? t('fixing') : t('fix')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ValidationPanel() {
  const t = useT();
  const { issues } = useAnalysis();
  const applyAllFixes = useStudio((s) => s.applyAllFixes);
  const [status, setStatus] = useState<string | null>(null);

  const fixable = useMemo(() => issues.filter((i) => i.fix), [issues]);
  const groups: { sev: Severity; key: 'critical' | 'warning' | 'recommendation' }[] = [
    { sev: 'critical', key: 'critical' },
    { sev: 'warning', key: 'warning' },
    { sev: 'recommendation', key: 'recommendation' },
  ];

  const handleFixAll = () => {
    if (fixable.length === 0) return;
    const applied = applyAllFixes(fixable.map((i) => i.fix!));
    setStatus(applied > 0 ? t('fixAllDone').replace('{count}', String(applied)) : t('fixFailed'));
    window.setTimeout(() => setStatus(null), 2500);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--studio-border)] p-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('validation')}</h2>
        {fixable.length > 0 && (
          <button
            type="button"
            onClick={handleFixAll}
            className="flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/25"
          >
            <Wrench className="h-3.5 w-3.5" />
            {t('fixAll')} ({fixable.length})
          </button>
        )}
      </div>

      {status && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-300">
          {status}
        </div>
      )}

      <div className="flex gap-2 border-b border-[var(--studio-border)] px-3 py-2 text-[11px]">
        {groups.map((g) => {
          const count = issues.filter((i) => i.severity === g.sev).length;
          const meta = SEVERITY_META[g.sev];
          return (
            <div key={g.key} className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${meta.bg}`}>
              <span className={`h-2 w-2 rounded-full ${g.sev === 'critical' ? 'bg-red-500' : g.sev === 'warning' ? 'bg-orange-400' : 'bg-blue-400'}`} />
              <span className={`font-semibold ${meta.color}`}>{count}</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {issues.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
            <span>{t('noIssues')}</span>
          </div>
        ) : (
          groups.map((g) => {
            const list = issues.filter((i) => i.severity === g.sev);
            if (list.length === 0) return null;
            return (
              <div key={g.key} className="space-y-2">
                {list.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onFixed={() => {
                      setStatus(t('fixDone'));
                      window.setTimeout(() => setStatus(null), 2000);
                    }}
                    onFailed={() => {
                      setStatus(t('fixFailed'));
                      window.setTimeout(() => setStatus(null), 2500);
                    }}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
