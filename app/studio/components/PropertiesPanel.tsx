'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { getCatalogEntry, type CatalogEntry } from '../lib/catalog';
import { Icon } from './lucide-icon';
import { Trash2 } from 'lucide-react';

/** Human-readable spec rows per domain. */
function specRows(entry: CatalogEntry): { label: string; value: string }[] {
  switch (entry.domain) {
    case 'cable':
      return [
        { label: 'CSA', value: `${entry.csaMm2} mm²` },
        { label: 'Ampacity', value: `${entry.ampacityA} A` },
        { label: 'Cores', value: `${entry.coreCount}` },
        { label: 'V rating', value: `${entry.voltageRating} V` },
        { label: 'R', value: `${entry.resistanceOhmPerKm} Ω/km` },
        { label: 'Cost/m', value: `${entry.costPerMeter}` },
      ];
    case 'protection':
      return [
        { label: 'In', value: `${entry.ratedCurrentA} A` },
        { label: 'Poles', value: `${entry.poles}P` },
        { label: 'Icu', value: `${entry.breakingCapacityKA} kA` },
        { label: 'Curve', value: entry.tripCurve },
        ...(entry.residualSensitivityMa ? [{ label: 'IΔn', value: `${entry.residualSensitivityMa} mA` }] : []),
      ];
    case 'source':
      return [
        { label: 'Type', value: entry.sourceType },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'kVA', value: `${entry.ratedKva}` },
        { label: 'PF', value: `${entry.powerFactor}` },
        { label: 'η', value: `${(entry.efficiency * 100).toFixed(0)}%` },
        { label: 'Isc', value: `${entry.scContributionKA} kA` },
      ];
    case 'load':
      return [
        { label: 'Power', value: `${entry.powerW} W` },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'Phases', value: `${entry.phases}` },
        { label: 'PF', value: `${entry.powerFactor}` },
        { label: 'Demand', value: `${entry.demandFactor}` },
      ];
    case 'hvac':
      return [
        { label: 'Cooling', value: `${entry.coolingKw} kW` },
        { label: 'Heating', value: `${entry.heatingKw} kW` },
        { label: 'Input', value: `${entry.inputKw} kW` },
        { label: 'COP', value: `${entry.cop}` },
        { label: 'EER', value: `${entry.eer}` },
        { label: 'BTU', value: `${Math.round(entry.coolingKw * 3412)} ` },
      ];
    case 'sensor':
      return [
        { label: 'Type', value: entry.sensorType },
        { label: 'Protocol', value: entry.protocol },
        { label: 'Voltage', value: `${entry.voltage} V` },
        { label: 'Current', value: `${entry.currentMa} mA` },
      ];
    case 'smarthome':
      return [
        { label: 'Protocol', value: entry.protocol },
        { label: 'Class', value: entry.deviceClass },
        { label: 'Channels', value: `${entry.channels}` },
        ...(entry.channelCurrentA ? [{ label: 'Ch current', value: `${entry.channelCurrentA} A` }] : []),
        { label: 'Bus', value: `${entry.busCurrentMa} mA` },
      ];
    default:
      return [];
  }
}

export function PropertiesPanel() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const node = useStudio((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const updateParam = useStudio((s) => s.updateNodeParam);
  const removeNode = useStudio((s) => s.removeNode);

  if (!selectedId || !node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--studio-muted)]">
        {t('noSelection')}
      </div>
    );
  }

  const entry = getCatalogEntry(node.catalogId);
  if (!entry) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--studio-border)] p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${entry.color}1f`, color: entry.color }}
          >
            <Icon name={entry.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-[var(--studio-text)]">{entry.name[locale]}</div>
            <div className="truncate text-xs text-[var(--studio-muted)]">{entry.manufacturer} · {entry.model}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {entry.domain === 'cable' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('length')}</span>
            <input
              type="number"
              min={1}
              value={Number(node.params.lengthM ?? 20)}
              onChange={(e) => updateParam(node.id, 'lengthM', Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
            />
          </label>
        )}

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('properties')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {specRows(entry).map((row) => (
              <div key={row.label} className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2.5 py-1.5">
                <div className="text-[10px] text-[var(--studio-muted)]">{row.label}</div>
                <div className="text-xs font-semibold text-[var(--studio-text)]">{row.value}</div>
              </div>
            ))}
          </div>
        </div>

        {entry.standards.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('standards')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {entry.standards.map((s) => (
                <span key={s} className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--studio-border)] p-3">
        <button
          onClick={() => removeNode(node.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
          {t('delete')}
        </button>
      </div>
    </div>
  );
}
