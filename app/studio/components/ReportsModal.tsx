'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '../lib/store';
import { useAnalysis, useAutonomousReports, useT } from './hooks';
import { getCatalogEntry } from '../lib/catalog';
import { resolveNodes } from '../lib/model';
import { buildBoq, buildLoadSchedule, buildCableSchedule } from '../lib/engine/reports';
import { buildingTypeLabel } from '../lib/project';
import { X, FileBarChart2 } from 'lucide-react';

type Tab = 'boq' | 'loads' | 'cables' | 'hvac' | 'lighting' | 'smart' | 'compliance';

export function ReportsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const nodes = useStudio((s) => s.nodes);
  const edges = useStudio((s) => s.edges);
  const designName = useStudio((s) => s.designName);
  const project = useStudio((s) => s.project);
  const { compliance } = useAnalysis();
  const { hvac, lighting, smart, assumptions } = useAutonomousReports();
  const [tab, setTab] = useState<Tab>('boq');

  const { boq, loads, cables } = useMemo(() => {
    const resolved = resolveNodes(nodes, getCatalogEntry);
    return { boq: buildBoq(resolved), loads: buildLoadSchedule(resolved), cables: buildCableSchedule(resolved, edges) };
  }, [nodes, edges]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'boq', label: t('boq') },
    { key: 'loads', label: t('loadSchedule') },
    { key: 'cables', label: t('cableSchedule') },
    { key: 'hvac', label: t('hvacReport') },
    { key: 'lighting', label: t('lightingReport') },
    { key: 'smart', label: t('smartReport') },
    { key: 'compliance', label: t('compliance') },
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--studio-border)] px-4 py-2 text-[11px] text-[var(--studio-muted)]">
          <span className="font-semibold text-[var(--studio-text)]">{designName || '—'}</span>
          {project.client && <span>{t('client')}: {project.client}</span>}
          <span>{t('buildingType')}: {buildingTypeLabel(project.buildingType)[locale] ?? buildingTypeLabel(project.buildingType).en}</span>
          {project.reference && <span>{t('reference')}: {project.reference}</span>}
          <span>{project.standards.join(', ')}</span>
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

          {tab === 'hvac' && (
            hvac.rooms.length === 0 ? <Empty t={t} /> : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                  <Stat label="Cooling" value={`${hvac.totalCoolingKw} kW`} />
                  <Stat label="Heating" value={`${hvac.totalHeatingKw} kW`} />
                  <Stat label="BTU" value={String(hvac.totalBtu)} />
                  <Stat label="Est. kWh/y" value={String(hvac.annualKwhEstimate)} />
                </div>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Room</th><th className={th}>m²</th><th className={th}>Cool kW</th><th className={th}>Heat kW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hvac.rooms.map((r) => (
                      <tr key={r.roomId}>
                        <td className={td}>{r.label}</td><td className={td}>{r.areaM2}</td><td className={td}>{r.coolingKw}</td><td className={td}>{r.heatingKw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Assumptions list={hvac.assumptions} />
              </div>
            )
          )}

          {tab === 'lighting' && (
            lighting.rooms.length === 0 ? <Empty t={t} /> : (
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--studio-muted)]">{lighting.totalFixtures} fixtures · {lighting.totalPowerW} W total</p>
                <table className="w-full">
                  <thead>
                    <tr><th className={th}>Room</th><th className={th}>Lux</th><th className={th}>{t('fixtureType')}</th><th className={th}>Fixtures</th><th className={th}>W</th></tr>
                  </thead>
                  <tbody>
                    {lighting.rooms.map((r) => (
                      <tr key={r.roomId}>
                        <td className={td}>{r.label}</td>
                        <td className={td}>{r.luxTarget} → {r.achievedLux}</td>
                        <td className={td}>{r.fixtureType}</td>
                        <td className={td}>{r.fixturesRecommended}</td>
                        <td className={td}>{r.powerW}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Assumptions list={lighting.assumptions} />
              </div>
            )
          )}

          {tab === 'smart' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                <Stat label="Protocol" value={smart.protocol} />
                <Stat label="Bus mA" value={String(smart.totalBusMa)} />
                <Stat label="PSU" value={`${smart.psuRequired}×640mA`} />
                <Stat label="Devices" value={String(smart.devices.length)} />
              </div>
              {smart.devices.length > 0 && (
                <table className="w-full">
                  <thead><tr><th className={th}>Label</th><th className={th}>Address</th><th className={th}>Class</th></tr></thead>
                  <tbody>
                    {smart.devices.map((d) => (
                      <tr key={d.nodeId}><td className={td}>{d.label}</td><td className={td}>{d.address}</td><td className={td}>{d.deviceClass}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Assumptions list={smart.assumptions} />
            </div>
          )}

          {tab === 'compliance' && (
            compliance.length === 0 ? <Empty t={t} /> : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>{t('standard')}</th>
                    <th className={th}>{t('compliance')}</th>
                    <th className={th}>{t('violations')}</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.map((row) => (
                    <tr key={row.standard}>
                      <td className={td}>{row.label[locale] ?? row.label.en}</td>
                      <td className={`${td} font-semibold ${row.percent >= 85 ? 'text-emerald-400' : row.percent >= 65 ? 'text-yellow-400' : 'text-orange-400'}`}>
                        {row.percent}%
                      </td>
                      <td className={td}>{row.violations}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5">
      <div className="text-[9px] text-[var(--studio-muted)]">{label}</div>
      <div className="font-semibold text-[var(--studio-text)]">{value}</div>
    </div>
  );
}

function Assumptions({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-200">
      <div className="mb-1 font-bold uppercase tracking-wide">Assumptions</div>
      <ul className="list-inside list-disc space-y-0.5">{list.slice(0, 4).map((a) => <li key={a}>{a}</li>)}</ul>
    </div>
  );
}
