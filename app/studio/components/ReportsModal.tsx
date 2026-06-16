'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { getCatalogEntry } from '../lib/catalog';
import { resolveNodes } from '../lib/model';
import { buildBoq, buildLoadSchedule, buildCableSchedule } from '../lib/engine/reports';
import { X, FileBarChart2 } from 'lucide-react';

type Tab = 'boq' | 'loads' | 'cables';

export function ReportsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const [tab, setTab] = useState<Tab>('boq');

  const { boq, loads, cables } = useMemo(() => {
    const resolved = resolveNodes(nodes, getCatalogEntry);
    return { boq: buildBoq(resolved), loads: buildLoadSchedule(resolved), cables: buildCableSchedule(resolved, edges) };
  }, [nodes, edges]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'boq', label: t('boq') },
    { key: 'loads', label: t('loadSchedule') },
    { key: 'cables', label: t('cableSchedule') },
  ];

  const th = 'px-3 py-2 text-start text-[10px] font-bold uppercase tracking-wide text-[var(--studio-muted)]';
  const td = 'px-3 py-1.5 text-[var(--studio-text)] border-t border-[var(--studio-border)]/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--studio-border)] px-4 py-3">
          <FileBarChart2 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-[var(--studio-text)]">{t('reports')}</h2>
          <button onClick={onClose} className="ms-auto rounded-lg p-1.5 text-[var(--studio-muted)] hover:bg-[var(--studio-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--studio-border)] px-3 py-2">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === tb.key ? 'bg-cyan-500/15 text-cyan-300' : 'text-[var(--studio-muted)] hover:bg-[var(--studio-hover)]'}`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
          {tab === 'boq' && (
            boq.rows.length === 0 ? <Empty t={t} /> : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Component</th><th className={th}>Model</th><th className={th}>Unit</th>
                    <th className={th}>Qty</th><th className={th}>Unit cost</th><th className={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {boq.rows.map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{r.name}</td><td className={td}>{r.manufacturer} {r.model}</td><td className={td}>{r.unit}</td>
                      <td className={td}>{r.quantity}</td><td className={td}>{r.unitCost.toFixed(2)}</td><td className={`${td} font-semibold`}>{r.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${td} font-bold`} colSpan={5}>{t('total')}</td>
                    <td className={`${td} font-bold text-cyan-400`}>{boq.grandTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )
          )}

          {tab === 'loads' && (
            loads.rows.length === 0 ? <Empty t={t} /> : (
              <table className="w-full">
                <thead>
                  <tr><th className={th}>Tag</th><th className={th}>Load</th><th className={th}>Power (W)</th><th className={th}>V</th><th className={th}>Ph</th><th className={th}>PF</th><th className={th}>Current (A)</th></tr>
                </thead>
                <tbody>
                  {loads.rows.map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{r.tag}</td><td className={td}>{r.name}</td><td className={td}>{r.powerW}</td>
                      <td className={td}>{r.voltage}</td><td className={td}>{r.phases}</td><td className={td}>{r.pf}</td><td className={`${td} font-semibold`}>{r.current.toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={`${td} font-bold`} colSpan={2}>{t('total')}</td>
                    <td className={`${td} font-bold`}>{(loads.totalKw * 1000).toFixed(0)}</td>
                    <td className={td} colSpan={3}></td>
                    <td className={`${td} font-bold text-cyan-400`}>{loads.totalA.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            )
          )}

          {tab === 'cables' && (
            cables.length === 0 ? <Empty t={t} /> : (
              <table className="w-full">
                <thead>
                  <tr><th className={th}>Tag</th><th className={th}>Type</th><th className={th}>CSA (mm²)</th><th className={th}>Cores</th><th className={th}>Material</th><th className={th}>Length (m)</th><th className={th}>Ampacity (A)</th><th className={th}>Vdrop (%)</th></tr>
                </thead>
                <tbody>
                  {cables.map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{r.tag}</td><td className={td}>{r.type}</td><td className={td}>{r.csa}</td><td className={td}>{r.cores}</td>
                      <td className={td}>{r.material}</td><td className={td}>{r.lengthM}</td><td className={td}>{r.ampacity}</td>
                      <td className={`${td} font-semibold ${r.vdropPct > 4 ? 'text-orange-400' : ''}`}>{r.vdropPct.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ t }: { t: (k: 'noData') => string }) {
  return <div className="py-10 text-center text-sm text-[var(--studio-muted)]">{t('noData')}</div>;
}
