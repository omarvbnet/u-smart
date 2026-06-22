'use client';

import { useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import {
  BUILDING_TYPES,
  HVAC_OPTIONS,
  ENERGY_SOURCES,
  ALL_STANDARDS,
  SMART_ACTUATOR_TIERS,
  defaultSmartChannels,
  effectiveHvacTypes,
  type BuildingType,
  type HvacSystemType,
  type HvacUnitMode,
  type EnergySourceType,
  type SmartProtocol,
  type SmartActuatorTier,
  type SmartChannelCounts,
  type ProjectInfo,
} from '../lib/project';
import { ChevronLeft, ChevronRight, Sparkles, Building2, Grid3x3, Upload, PenLine } from 'lucide-react';
import type { FloorPlanSource } from '../lib/project';
import {
  isResidentialBuilding,
  bedroomRangeForBuilding,
  defaultBedroomsForBuilding,
  layoutSummary,
} from '../lib/engine/residential-layouts';
import { floorCountRange } from '../lib/engine/floor-layout';

type FloorPlanChoice = 'zero' | 'import' | 'skip';
type RoomDistribution = 'perFloor' | 'groundOnly';

type Props = {
  onComplete: () => void;
};

export function SetupWizard({ onComplete }: Props) {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const completeWizard = useStudio((s) => s.completeWizard);
  const generatingProject = useStudio((s) => s.generatingProject);
  const [step, setStep] = useState(0);
  const [floorPlan, setFloorPlan] = useState<FloorPlanChoice>('zero');
  const [roomDistribution, setRoomDistribution] = useState<RoomDistribution>('perFloor');
  const [projectBrief, setProjectBrief] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [draft, setDraft] = useState<ProjectInfo>(() => useStudio.getState().project);
  const generateFromBrief = useStudio((s) => s.generateFromBrief);

  const busy = finishing || generatingProject;

  const patch = (p: Partial<ProjectInfo>) => setDraft((d) => ({ ...d, ...p }));

  const pickBuildingType = (id: BuildingType) => {
    setDraft((d) => {
      const bedrooms = isResidentialBuilding(id) ? defaultBedroomsForBuilding(id) : d.bedrooms;
      const floorCount = Math.min(floorCountRange(id).max, Math.max(floorCountRange(id).min, d.floorCount));
      return {
        ...d,
        buildingType: id,
        bedrooms,
        floorCount,
        hvacUnitCount: bedrooms * floorCount,
        smartChannels: defaultSmartChannels(d.smartActuatorTier, bedrooms * floorCount),
      };
    });
  };

  const setSmartTier = (tier: SmartActuatorTier) => {
    setDraft((d) => ({
      ...d,
      smartActuatorTier: tier,
      smartChannels: defaultSmartChannels(tier, d.bedrooms),
    }));
  };

  const patchChannels = (key: keyof SmartChannelCounts, delta: number) => {
    setDraft((d) => ({
      ...d,
      smartChannels: {
        ...d.smartChannels,
        [key]: Math.max(0, d.smartChannels[key] + delta),
      },
    }));
  };

  const roomEstimate = Math.max(3, draft.bedrooms + 2);

  const residential = isResidentialBuilding(draft.buildingType);
  const bedRange = bedroomRangeForBuilding(draft.buildingType);
  const floorRange = floorCountRange(draft.buildingType);

  const toggleHvac = (id: HvacSystemType) => {
    setDraft((d) => ({
      ...d,
      hvacTypes: d.hvacTypes.includes(id) ? d.hvacTypes.filter((x) => x !== id) : [...d.hvacTypes, id],
    }));
  };

  const toggleEnergy = (id: EnergySourceType) => {
    setDraft((d) => ({
      ...d,
      energySources: d.energySources.includes(id)
        ? d.energySources.length > 1
          ? d.energySources.filter((x) => x !== id)
          : d.energySources
        : [...d.energySources, id],
    }));
  };

  const finish = (mode: 'blank' | 'generate' | 'manual') => {
    if (busy) return;
    setFinishing(true);
    const fp: FloorPlanSource | 'skip' = floorPlan;
    const manualMode = mode === 'manual' || (mode === 'blank' && floorPlan === 'zero');
    const finalized: ProjectInfo = {
      ...draft,
      hvacTypes: effectiveHvacTypes(draft),
      setupComplete: true,
      floorPlanSource: fp === 'zero' ? 'zero' : fp === 'import' ? 'import' : 'none',
      designMode: manualMode ? 'manual' : 'assisted',
    };
    onComplete();
    if (projectBrief.trim() && mode === 'generate') {
      completeWizard(finalized, { generateDesign: false, floorPlan: fp, roomDistribution, manualMode: false });
      generateFromBrief(projectBrief.trim());
      return;
    }
    completeWizard(finalized, {
      generateDesign: mode === 'generate',
      floorPlan: fp,
      roomDistribution,
      manualMode,
    });
  };

  const steps = [
    t('wizardBuilding'),
    t('wizardSmart'),
    t('wizardHvac'),
    t('wizardEnergy'),
    t('wizardFloorPlan'),
    t('wizardReview'),
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] shadow-2xl">
        <div className="border-b border-[var(--studio-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-[var(--studio-text)]">{t('wizardTitle')}</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--studio-muted)]">{t('wizardSubtitle')}</p>
          <div className="mt-3 flex gap-1">
            {steps.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-cyan-400' : 'bg-[var(--studio-border)]'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-[var(--studio-text)]">{t('buildingType')}</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BUILDING_TYPES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => pickBuildingType(b.id as BuildingType)}
                    className={`rounded-xl border px-3 py-3 text-xs font-semibold transition ${
                      draft.buildingType === b.id
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
                        : 'border-[var(--studio-border)] text-[var(--studio-text)] hover:bg-[var(--studio-hover)]'
                    }`}
                  >
                    {b.label[locale] ?? b.label.en}
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-[var(--studio-text)]">{t('floorCount')}</p>
                <p className="text-[10px] text-[var(--studio-muted)]">{t('floorCountHint')}</p>
                <ChannelStepper
                  label={t('floors')}
                  value={draft.floorCount}
                  onDec={() =>
                    patch({
                      floorCount: Math.max(floorRange.min, draft.floorCount - 1),
                      smartChannels: defaultSmartChannels(draft.smartActuatorTier, draft.bedrooms * Math.max(floorRange.min, draft.floorCount - 1)),
                    })
                  }
                  onInc={() =>
                    patch({
                      floorCount: Math.min(floorRange.max, draft.floorCount + 1),
                      smartChannels: defaultSmartChannels(draft.smartActuatorTier, draft.bedrooms * Math.min(floorRange.max, draft.floorCount + 1)),
                    })
                  }
                />
              </div>
              {residential && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <p className="text-[11px] text-[var(--studio-muted)]">{layoutSummary(draft.buildingType, draft.bedrooms, locale)}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--studio-text)]">{t('bedrooms')}</span>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--studio-border)] px-3 py-1 text-sm font-bold"
                      onClick={() =>
                        patch({
                          bedrooms: Math.max(bedRange.min, draft.bedrooms - 1),
                          hvacUnitCount: Math.max(bedRange.min, draft.bedrooms - 1),
                          smartChannels: defaultSmartChannels(draft.smartActuatorTier, Math.max(bedRange.min, draft.bedrooms - 1) * draft.floorCount),
                        })
                      }
                      disabled={draft.bedrooms <= bedRange.min}
                    >
                      −
                    </button>
                    <span className="text-sm font-bold">{draft.bedrooms}</span>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--studio-border)] px-3 py-1 text-sm font-bold"
                      onClick={() =>
                        patch({
                          bedrooms: Math.min(bedRange.max, draft.bedrooms + 1),
                          hvacUnitCount: Math.min(bedRange.max, draft.bedrooms + 1),
                          smartChannels: defaultSmartChannels(draft.smartActuatorTier, Math.min(bedRange.max, draft.bedrooms + 1) * draft.floorCount),
                        })
                      }
                      disabled={draft.bedrooms >= bedRange.max}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('client')} value={draft.client} onChange={(v) => patch({ client: v })} />
                <Field label={t('location')} value={draft.location} onChange={(v) => patch({ location: v })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--studio-text)]">{t('projectBrief')}</label>
                <p className="mb-2 text-[11px] text-[var(--studio-muted)]">{t('projectBriefHint')}</p>
                <textarea
                  value={projectBrief}
                  onChange={(e) => setProjectBrief(e.target.value)}
                  placeholder={t('projectBriefPlaceholder')}
                  rows={4}
                  className="w-full rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-[var(--studio-border)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--studio-text)]">{t('smartBuilding')}</span>
                <Toggle on={draft.smartBuilding} onChange={(v) => patch({ smartBuilding: v, smartProtocol: v ? draft.smartProtocol ?? 'HDL' : null })} />
              </label>
              {draft.smartBuilding && (
                <>
                  <div>
                    <span className="mb-2 block text-xs font-semibold text-[var(--studio-text)]">{t('smartProtocol')}</span>
                    <div className="flex flex-wrap gap-2">
                      {(['HDL', 'KNX', 'BOTH'] as SmartProtocol[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => patch({ smartProtocol: p })}
                          className={`rounded-lg border px-4 py-2 text-xs font-bold ${
                            draft.smartProtocol === p ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-[var(--studio-border)]'
                          }`}
                        >
                          {p === 'BOTH' ? 'HDL + KNX' : p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-2 block text-xs font-semibold text-[var(--studio-text)]">{t('actuatorQuality')}</span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SMART_ACTUATOR_TIERS.map((tier) => (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setSmartTier(tier.id)}
                          className={`rounded-xl border p-3 text-start text-xs ${
                            draft.smartActuatorTier === tier.id
                              ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                              : 'border-[var(--studio-border)] text-[var(--studio-text)]'
                          }`}
                        >
                          <div className="font-bold">{tier.label[locale] ?? tier.label.en}</div>
                          <div className="mt-1 text-[10px] text-[var(--studio-muted)]">{tier.desc[locale] ?? tier.desc.en}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-2 block text-xs font-semibold text-[var(--studio-text)]">{t('smartChannelPlan')}</span>
                    <p className="mb-2 text-[10px] text-[var(--studio-muted)]">{t('smartChannelPlanHint')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['relay', 'dimmer', 'curtain', 'dryContact'] as const).map((key) => (
                        <ChannelStepper
                          key={key}
                          label={t(`channel_${key}`)}
                          value={draft.smartChannels[key]}
                          onDec={() => patchChannels(key, -1)}
                          onInc={() => patchChannels(key, 1)}
                        />
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center justify-between rounded-xl border border-[var(--studio-border)] px-4 py-3 text-xs">
                    <span className="text-[var(--studio-text)]">{t('smartAlignChannels')}</span>
                    <Toggle on={draft.smartAlignChannels} onChange={(v) => patch({ smartAlignChannels: v })} />
                  </label>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--studio-text)]">{t('coolingSystem')}</span>
                  <select
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm"
                    value={draft.coolingSystem}
                    onChange={(e) => patch({ coolingSystem: e.target.value as HvacSystemType, hvacMode: 'manual' })}
                  >
                    {HVAC_OPTIONS.map((h) => (
                      <option key={h.id} value={h.id}>{h.label[locale] ?? h.label.en}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--studio-text)]">{t('heatingSystem')}</span>
                  <select
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm"
                    value={draft.heatingSystem}
                    onChange={(e) => patch({ heatingSystem: e.target.value as HvacSystemType, hvacMode: 'manual' })}
                  >
                    {HVAC_OPTIONS.map((h) => (
                      <option key={h.id} value={h.id}>{h.label[locale] ?? h.label.en}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-[var(--studio-text)]">{t('hvacUnitAlign')}</span>
                <div className="flex gap-2">
                  <ModeBtn
                    active={draft.hvacUnitMode === 'per_room'}
                    onClick={() => patch({ hvacUnitMode: 'per_room' as HvacUnitMode, hvacUnitCount: roomEstimate })}
                    label={t('hvacPerRoom')}
                  />
                  <ModeBtn
                    active={draft.hvacUnitMode === 'fixed'}
                    onClick={() => patch({ hvacUnitMode: 'fixed' as HvacUnitMode })}
                    label={t('hvacFixedCount')}
                  />
                </div>
                <p className="mt-2 text-[10px] text-[var(--studio-muted)]">
                  {draft.hvacUnitMode === 'per_room' ? t('hvacPerRoomHint') : t('hvacFixedCountHint')}
                </p>
              </div>
              {draft.hvacUnitMode === 'fixed' && (
                <ChannelStepper
                  label={t('hvacUnitCount')}
                  value={draft.hvacUnitCount}
                  onDec={() => patch({ hvacUnitCount: Math.max(1, draft.hvacUnitCount - 1) })}
                  onInc={() => patch({ hvacUnitCount: draft.hvacUnitCount + 1 })}
                />
              )}
              <div className="flex gap-2">
                <ModeBtn active={draft.hvacMode === 'auto'} onClick={() => patch({ hvacMode: 'auto' })} label={t('hvacAuto')} />
                <ModeBtn active={draft.hvacMode === 'manual'} onClick={() => patch({ hvacMode: 'manual' })} label={t('hvacManual')} />
              </div>
              {draft.hvacMode === 'manual' && (
                <div className="flex flex-wrap gap-2">
                  {HVAC_OPTIONS.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleHvac(h.id)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        draft.hvacTypes.includes(h.id) ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-[var(--studio-border)]'
                      }`}
                    >
                      {h.label[locale] ?? h.label.en}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ENERGY_SOURCES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleEnergy(e.id)}
                    className={`rounded-lg border px-4 py-2.5 text-xs font-semibold ${
                      draft.energySources.includes(e.id) ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-[var(--studio-border)]'
                    }`}
                  >
                    {e.label[locale] ?? e.label.en}
                  </button>
                ))}
              </div>
              {draft.energySources.includes('solar') && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <p className="text-xs font-semibold text-[var(--studio-text)]">{t('solarCapacity')}</p>
                  <p className="text-[10px] text-[var(--studio-muted)]">{t('solarCapacityHint')}</p>
                  <label className="block">
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{draft.solarCapacityKw} kW</span>
                      <span className="text-[var(--studio-muted)]">5–500 kW</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={500}
                      step={5}
                      value={draft.solarCapacityKw}
                      onChange={(e) => patch({ solarCapacityKw: Number(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--studio-muted)]">{t('wizardFloorPlanHint')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <FloorPlanCard
                  active={floorPlan === 'zero'}
                  onClick={() => setFloorPlan('zero')}
                  icon={Grid3x3}
                  title={t('floorPlanFromZero')}
                  hint={t('floorPlanFromZeroHint')}
                />
                <FloorPlanCard
                  active={floorPlan === 'import'}
                  onClick={() => setFloorPlan('import')}
                  icon={Upload}
                  title={t('floorPlanImport')}
                  hint={t('floorPlanImportHint')}
                />
                <FloorPlanCard
                  active={floorPlan === 'skip'}
                  onClick={() => setFloorPlan('skip')}
                  icon={PenLine}
                  title={t('floorPlanSkip')}
                  hint={t('floorPlanSkipHint')}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-sm text-[var(--studio-text)]">
              {floorPlan === 'zero' && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <p className="text-xs font-semibold text-cyan-200">{t('wizardManualProject')}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--studio-muted)]">{t('wizardManualProjectHint')}</p>
                </div>
              )}
              {draft.floorCount > 1 && floorPlan !== 'zero' && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
                  <p className="text-xs font-semibold text-[var(--studio-text)]">{t('roomDistributionTitle')}</p>
                  <p className="text-[10px] text-[var(--studio-muted)]">{t('roomDistributionHint')}</p>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--studio-border)] p-3">
                    <input
                      type="radio"
                      name="roomDistribution"
                      checked={roomDistribution === 'perFloor'}
                      onChange={() => setRoomDistribution('perFloor')}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-xs font-semibold">{t('roomDistributionPerFloor')}</span>
                      <span className="text-[10px] text-[var(--studio-muted)]">{t('roomDistributionPerFloorHint')}</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--studio-border)] p-3">
                    <input
                      type="radio"
                      name="roomDistribution"
                      checked={roomDistribution === 'groundOnly'}
                      onChange={() => setRoomDistribution('groundOnly')}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-xs font-semibold">{t('roomDistributionGroundOnly')}</span>
                      <span className="text-[10px] text-[var(--studio-muted)]">{t('roomDistributionGroundOnlyHint')}</span>
                    </span>
                  </label>
                </div>
              )}
              <Row label={t('buildingType')} value={BUILDING_TYPES.find((b) => b.id === draft.buildingType)?.label[locale] ?? ''} />
              <Row label={t('floorCount')} value={String(draft.floorCount)} />
              <Row label={t('smartBuilding')} value={draft.smartBuilding ? (draft.smartProtocol ?? '—') : t('no')} />
              {draft.smartBuilding && (
                <Row
                  label={t('smartChannelPlan')}
                  value={`R${draft.smartChannels.relay} D${draft.smartChannels.dimmer} C${draft.smartChannels.curtain}`}
                />
              )}
              <Row
                label={t('coolingSystem')}
                value={HVAC_OPTIONS.find((h) => h.id === draft.coolingSystem)?.label[locale] ?? draft.coolingSystem}
              />
              <Row
                label={t('heatingSystem')}
                value={HVAC_OPTIONS.find((h) => h.id === draft.heatingSystem)?.label[locale] ?? draft.heatingSystem}
              />
              <Row
                label={t('hvacUnitAlign')}
                value={draft.hvacUnitMode === 'per_room' ? t('hvacPerRoom') : `${draft.hvacUnitCount} ${t('units')}`}
              />
              <Row label={t('wizardEnergy')} value={draft.energySources.join(', ')} />
              {draft.energySources.includes('solar') && (
                <Row label={t('solarCapacity')} value={`${draft.solarCapacityKw} kW`} />
              )}
              <Row
                label={t('wizardFloorPlan')}
                value={
                  floorPlan === 'zero'
                    ? t('floorPlanFromZero')
                    : floorPlan === 'import'
                      ? t('floorPlanImport')
                      : t('floorPlanSkip')
                }
              />
              <div>
                <span className="text-xs text-[var(--studio-muted)]">{t('standards')}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ALL_STANDARDS.map((s) => (
                    <button
                      key={s}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          standards: d.standards.includes(s) ? d.standards.filter((x) => x !== s) : [...d.standards, s],
                        }))
                      }
                      className={`rounded px-2 py-0.5 text-[10px] ${draft.standards.includes(s) ? 'bg-cyan-500/20 text-cyan-300' : 'bg-[var(--studio-hover)]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--studio-border)] px-6 py-4">
          <button
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-[var(--studio-muted)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> {t('back')}
          </button>
          {step < steps.length - 1 ? (
            <button
              disabled={busy}
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {t('next')} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {floorPlan === 'zero' ? (
                <>
                  <button
                    disabled={busy}
                    onClick={() => finish('manual')}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <PenLine className="h-4 w-4" /> {t('wizardManualProject')}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => finish('generate')}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" /> {t('wizardGenerate')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={busy}
                    onClick={() => finish('blank')}
                    className="rounded-lg border border-[var(--studio-border)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {t('wizardBlank')}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => finish('generate')}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" /> {t('wizardGenerate')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FloorPlanCard({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Grid3x3;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-start transition ${
        active ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/40' : 'border-[var(--studio-border)] hover:bg-[var(--studio-hover)]'
      }`}
    >
      <Icon className={`h-6 w-6 ${active ? 'text-cyan-400' : 'text-[var(--studio-muted)]'}`} />
      <span className="text-sm font-bold text-[var(--studio-text)]">{title}</span>
      <span className="text-[11px] leading-snug text-[var(--studio-muted)]">{hint}</span>
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase text-[var(--studio-muted)]">{label}</span>
      <input
        className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-sm text-[var(--studio-text)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--studio-border)]/50 py-2">
      <span className="text-[var(--studio-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--studio-border)]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${active ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300' : 'border-[var(--studio-border)]'}`}
    >
      {label}
    </button>
  );
}

function ChannelStepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--studio-border)] px-3 py-2">
      <span className="text-[10px] font-semibold text-[var(--studio-text)]">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border border-[var(--studio-border)] px-2 py-0.5 text-sm font-bold" onClick={onDec}>−</button>
        <span className="min-w-[2ch] text-center text-sm font-bold">{value}</span>
        <button type="button" className="rounded border border-[var(--studio-border)] px-2 py-0.5 text-sm font-bold" onClick={onInc}>+</button>
      </div>
    </div>
  );
}
