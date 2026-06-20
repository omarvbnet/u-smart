'use client';

import { useEffect, useMemo } from 'react';
import { useStudio } from '../lib/store';
import { useSimulation, useT } from './hooks';
import { getCatalogEntry } from '../lib/catalog';
import { resolveNodes } from '../lib/model';
import { aggregateSimulation } from '../lib/engine/sim-metrics';
import { Activity, Zap, Gauge } from 'lucide-react';

export function SimulationHud() {
  const t = useT();
  const simulating = useStudio((s) => s.simulating);
  const nodes = useStudio((s) => s.nodes);
  const simEnergyKwh = useStudio((s) => s.simEnergyKwh);
  const twinConnected = useStudio((s) => s.twinConnected);
  const tickSimulation = useStudio((s) => s.tickSimulation);
  const sim = useSimulation();

  useEffect(() => {
    if (!simulating) return;
    const id = window.setInterval(() => tickSimulation(), 1000);
    return () => window.clearInterval(id);
  }, [simulating, tickSimulation]);

  const metrics = useMemo(() => {
    if (!simulating) return null;
    return aggregateSimulation(resolveNodes(nodes, getCatalogEntry), sim);
  }, [nodes, sim, simulating]);

  if (!simulating || !metrics) return null;

  return (
    <div className="absolute top-3 z-10 ltr:right-3 rtl:left-3 w-56 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 animate-pulse text-emerald-400" />
        <span className="text-xs font-bold text-[var(--studio-text)]">{t('liveSimulation')}</span>
        {twinConnected && (
          <span className="ms-auto rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-300">
            {t('twinStream')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <Metric icon={Zap} label={t('totalPower')} value={`${metrics.totalKw.toFixed(2)} kW`} />
        <Metric icon={Gauge} label={t('totalCurrent')} value={`${metrics.totalA.toFixed(1)} A`} />
        <div className="col-span-2 rounded-lg bg-[var(--studio-bg)] px-2 py-1.5">
          <span className="text-[var(--studio-muted)]">{t('energyUsed')}</span>
          <span className="ms-2 font-bold text-cyan-400">{simEnergyKwh.toFixed(3)} kWh</span>
        </div>
        <div className="col-span-2 text-[var(--studio-muted)]">
          {metrics.activeDevices} {t('activeDevices')} · {metrics.energisedDevices} {t('energised')}
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {Object.entries(metrics.byDomain).map(([d, v]) => (
          <div key={d} className="flex justify-between text-[9px]">
            <span className="text-[var(--studio-muted)]">{d}</span>
            <span className="font-semibold text-[var(--studio-text)]">{v.kw.toFixed(2)} kW</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--studio-bg)] px-2 py-1.5">
      <div className="flex items-center gap-1 text-[var(--studio-muted)]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="font-bold text-[var(--studio-text)]">{value}</div>
    </div>
  );
}
