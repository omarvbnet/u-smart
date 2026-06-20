'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { busHealth } from '../lib/engine/bus';
import { Activity, ChevronDown, Trash2, Radio, AlertTriangle } from 'lucide-react';

export function BusMonitor() {
  const t = useT();
  const simulating = useStudio((s) => s.simulating);
  const telegrams = useStudio((s) => s.telegrams);
  const nodes = useStudio((s) => s.nodes);
  const project = useStudio((s) => s.project);
  const clearTelegrams = useStudio((s) => s.clearTelegrams);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'HDL' | 'KNX' | 'IO'>('ALL');

  const health = useMemo(() => busHealth(project, nodes), [project, nodes]);
  const list = filter === 'ALL' ? telegrams : telegrams.filter((g) => g.protocol === filter);

  if (!simulating) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[var(--studio-border)] bg-[var(--studio-panel)]/95 backdrop-blur">
      {!health.busPowerOk && project.smartBuilding && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t('busPowerBlocked')}: {health.loadMa} mA {t('busLoadMa')} · {health.installedPsuMa} mA {t('busPsuInstalled')} · {t('addBusPsuHint')}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Radio className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-bold text-[var(--studio-text)]">{t('busMonitor')}</span>
        <span
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            health.busPowerOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${health.busPowerOk ? 'animate-pulse bg-emerald-400' : 'bg-red-400'}`} />
          {t('busVoltage')} {health.voltageV}V
        </span>
        {project.smartBuilding && (
          <span className="rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
            {health.loadMa}/{health.installedPsuMa} mA
          </span>
        )}
        <span className="rounded-md bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
          HDL {health.hdlOnline}/{health.hdl} {t('online')}
        </span>
        <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
          KNX {health.knxOnline}/{health.knx} {t('online')}
        </span>

        <div className="ms-auto flex items-center gap-1">
          {(['ALL', 'HDL', 'KNX', 'IO'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${filter === p ? 'bg-cyan-500/20 text-cyan-300' : 'text-[var(--studio-muted)] hover:text-[var(--studio-text)]'}`}
            >
              {p}
            </button>
          ))}
          <button onClick={clearTelegrams} className="rounded p-1 text-[var(--studio-muted)] hover:text-red-400" title="clear">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setOpen((o) => !o)} className="rounded p-1 text-[var(--studio-muted)]">
            <ChevronDown className={`h-4 w-4 transition ${open ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="max-h-44 overflow-y-auto border-t border-[var(--studio-border)] font-mono text-[10px]">
          {list.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[var(--studio-muted)]">
              <Activity className="h-4 w-4" />
              {t('emptyHint')}
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {list.map((g) => (
                  <tr key={g.id} className="border-b border-[var(--studio-border)]/40">
                    <td className="whitespace-nowrap px-2 py-1 text-[var(--studio-muted)]">{new Date(g.t).toLocaleTimeString()}</td>
                    <td className="px-2 py-1">
                      <span className={`rounded px-1.5 py-0.5 font-bold ${g.protocol === 'HDL' ? 'text-rose-400 bg-rose-400/10' : g.protocol === 'KNX' ? 'text-emerald-400 bg-emerald-400/10' : 'text-blue-400 bg-blue-400/10'}`}>{g.protocol}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-cyan-300">{g.src} → {g.dst}</td>
                    <td className="px-2 py-1 text-[var(--studio-text)]">{g.op}</td>
                    <td className="px-2 py-1 font-bold text-amber-400">{g.value}</td>
                    <td className="px-2 py-1 text-[var(--studio-muted)]">{g.raw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
