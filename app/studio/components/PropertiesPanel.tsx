'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { getCatalogEntry, CATALOG, type CatalogEntry } from '../lib/catalog';
import { controlsForEntry } from '../lib/controls';
import { declarationFor } from '../lib/engine/declarations';
import { PORT_COLOR } from './DeviceNode';
import { EntryImage } from './EntryImage';
import { Trash2, Zap, Plug } from 'lucide-react';

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
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  const room = useStudio((s) => s.rooms.find((r) => r.id === s.selectedRoomId));
  const node = useStudio((s) => s.nodes.find((n) => n.id === s.selectedNodeId));
  const edges = useStudio((s) => s.edges);
  const updateParam = useStudio((s) => s.updateNodeParam);
  const updateNodeLabel = useStudio((s) => s.updateNodeLabel);
  const replaceNodeCatalog = useStudio((s) => s.replaceNodeCatalog);
  const updateRoom = useStudio((s) => s.updateRoom);
  const removeNode = useStudio((s) => s.removeNode);
  const removeRoom = useStudio((s) => s.removeRoom);
  const control = useStudio((s) => (s.selectedNodeId ? s.controls[s.selectedNodeId] : undefined));
  const setControl = useStudio((s) => s.setControl);

  if (selectedRoomId && room) {
    const areaM2 = ((room.width / 50) * (room.height / 50)).toFixed(1);
    const input =
      'w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400';
    return (
      <div className="flex h-full flex-col p-4">
        <h3 className="mb-3 text-sm font-bold text-[var(--studio-text)]">{t('roomProperties')}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('roomLabel')}</span>
            <input className={input} value={room.label} onChange={(e) => updateRoom(room.id, { label: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--studio-muted)]">{t('roomZone')}</span>
            <select className={input} value={room.zone} onChange={(e) => updateRoom(room.id, { zone: e.target.value as typeof room.zone })}>
              {['general', 'bedroom', 'kitchen', 'bathroom', 'office', 'corridor', 'mechanical'].map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[var(--studio-border)] p-2">
              <div className="text-[var(--studio-muted)]">W × H</div>
              <div className="font-semibold">{Math.round(room.width)} × {Math.round(room.height)} px</div>
            </div>
            <div className="rounded-lg border border-[var(--studio-border)] p-2">
              <div className="text-[var(--studio-muted)]">{t('roomArea')}</div>
              <div className="font-semibold">{areaM2} m²</div>
            </div>
          </div>
        </div>
        <button
          onClick={() => removeRoom(room.id)}
          className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm text-red-400"
        >
          <Trash2 className="h-4 w-4" /> {t('deleteRoom')}
        </button>
      </div>
    );
  }

  if (!selectedId || !node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--studio-muted)]">
        {t('noSelection')}
      </div>
    );
  }

  const entry = getCatalogEntry(node.catalogId);
  if (!entry) return null;

  const declaration = declarationFor(entry);
  const controls = controlsForEntry(entry);
  const alternatives = CATALOG.filter((e) => e.domain === entry.domain && e.id !== entry.id).slice(0, 12);
  const connected = edges.filter((e) => e.source === node.id || e.target === node.id);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--studio-border)] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
            <EntryImage entry={entry} className="h-11 w-11" />
          </span>
          <div className="min-w-0 flex-1">
            <input
              className="w-full truncate rounded border border-transparent bg-transparent text-sm font-bold text-[var(--studio-text)] outline-none focus:border-cyan-400 px-1"
              value={node.label}
              onChange={(e) => updateNodeLabel(node.id, e.target.value)}
            />
            <div className="truncate text-xs text-[var(--studio-muted)]">{entry.manufacturer} · {entry.model}</div>
          </div>
        </div>
        {declaration && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold tracking-wide text-amber-500">{declaration.text}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {controls.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('controls')}</h3>
            <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] p-3">
              {controls.map((c) => {
                if (c.kind === 'toggle') {
                  const on = (control?.[c.key as 'on'] ?? (c.default as boolean)) === true;
                  return (
                    <div key={c.key} className="flex items-center justify-between">
                      <span className="text-xs text-[var(--studio-text)]">{c.label[locale]}</span>
                      <button
                        onClick={() => setControl(node.id, c.key, !on)}
                        className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--studio-border)]'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  );
                }
                if (c.kind === 'trigger') {
                  const active = (control?.[c.key as 'active'] ?? false) === true;
                  return (
                    <button
                      key={c.key}
                      onMouseDown={() => setControl(node.id, c.key, true)}
                      onMouseUp={() => setControl(node.id, c.key, false)}
                      onMouseLeave={() => active && setControl(node.id, c.key, false)}
                      className={`w-full rounded-lg py-2 text-xs font-semibold transition ${active ? 'bg-cyan-500 text-white' : 'bg-[var(--studio-hover)] text-[var(--studio-text)]'}`}
                    >
                      {c.label[locale]}
                    </button>
                  );
                }
                const val = Number(control?.[c.key as 'level' | 'setpoint'] ?? (c.default as number));
                return (
                  <div key={c.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--studio-text)]">{c.label[locale]}</span>
                      <span className="font-semibold text-cyan-400">{val}{c.unit}</span>
                    </div>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      value={val}
                      onChange={(e) => setControl(node.id, c.key, Number(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

        {entry.domain === 'load' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--studio-muted)]">{t('powerW')}</span>
            <input
              type="number"
              min={1}
              value={Number(node.params.powerW ?? (entry.domain === 'load' ? entry.powerW : 0))}
              onChange={(e) => updateParam(node.id, 'powerW', Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
            />
          </label>
        )}

        {entry.ports.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">
              <Plug className="h-3.5 w-3.5" /> {t('ports')}
            </h3>
            <div className="space-y-1.5">
              {entry.ports.map((p) => {
                const linked = connected.filter((e) =>
                  (e.source === node.id && e.sourceHandle === p.id) || (e.target === node.id && e.targetHandle === p.id),
                );
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2.5 py-1.5 text-[10px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PORT_COLOR[p.kind] }} />
                    <span className="font-semibold text-[var(--studio-text)]">{p.label[locale] ?? p.label.en}</span>
                    <span className="text-[var(--studio-muted)]">({p.kind} · {p.direction})</span>
                    <span className="ms-auto text-cyan-400">{linked.length ? `${linked.length} ${t('connected')}` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {alternatives.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('replaceModel')}</h3>
            <select
              className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-2 text-xs text-[var(--studio-text)]"
              value={entry.id}
              onChange={(e) => replaceNodeCatalog(node.id, e.target.value)}
            >
              <option value={entry.id}>{entry.model}</option>
              {alternatives.map((a) => (
                <option key={a.id} value={a.id}>{a.manufacturer} {a.model}</option>
              ))}
            </select>
          </div>
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
