'use client';

import { useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import {
  BUILDING_TYPES,
  HVAC_OPTIONS,
  ENERGY_SOURCES,
  ALL_STANDARDS,
  type BuildingType,
  type HvacSystemType,
  type EnergySourceType,
  type SmartProtocol,
  type ProjectInfo,
} from '../lib/project';
import { ChevronLeft, ChevronRight, Sparkles, Building2, Grid3x3, Upload, PenLine } from 'lucide-react';
import type { FloorPlanSource } from '../lib/project';

type FloorPlanChoice = 'zero' | 'import' | 'skip';

type Props = {
  onComplete: () => void;
};

export function SetupWizard({ onComplete }: Props) {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const completeWizard = useStudio((s) => s.completeWizard);
  const [step, setStep] = useState(0);
  const [floorPlan, setFloorPlan] = useState<FloorPlanChoice>('zero');
  const [projectBrief, setProjectBrief] = useState('');
  const [draft, setDraft] = useState<ProjectInfo>(() => useStudio.getState().project);
  const generateFromBrief = useStudio((s) => s.generateFromBrief);

  const patch = (p: Partial<ProjectInfo>) => setDraft((d) => ({ ...d, ...p }));

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

  const finish = (generate: boolean) => {
    const fp: FloorPlanSource | 'skip' = floorPlan;
    if (projectBrief.trim() && generate) {
      completeWizard({ ...draft, setupComplete: true, floorPlanSource: fp === 'zero' ? 'zero' : fp === 'import' ? 'import' : 'none' }, { generateDesign: false, floorPlan: fp });
      generateFromBrief(projectBrief.trim());
      onComplete();
      return;
    }
    completeWizard({ ...draft, setupComplete: true }, { generateDesign: generate, floorPlan: fp });
    onComplete();
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
                    onClick={() => patch({ buildingType: b.id as BuildingType })}
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
                <div className="flex flex-wrap gap-2">
                  {(['HDL', 'KNX', 'BOTH'] as SmartProtocol[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => patch({ smartProtocol: p })}
                      className={`rounded-lg border px-4 py-2 text-xs font-bold ${
                        draft.smartProtocol === p ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300' : 'border-[var(--studio-border)]'
                      }`}
                    >
                      {p === 'BOTH' ? 'HDL + KNX' : p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <ModeBtn active={draft.hvacMode === 'auto'} onClick={() => patch({ hvacMode: 'auto' })} label={t('hvacAuto')} />
                <ModeBtn active={draft.hvacMode === 'manual'} onClick={() => patch({ hvacMode: 'manual' })} label={t('hvacManual')} />
              </div>
              {draft.hvacMode === 'manual' && (
                <div className="flex flex-wrap gap-2">
                  {HVAC_OPTIONS.map((h) => (
                    <button
                      key={h.id}
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
            <div className="flex flex-wrap gap-2">
              {ENERGY_SOURCES.map((e) => (
                <button
                  key={e.id}
                  onClick={() => toggleEnergy(e.id)}
                  className={`rounded-lg border px-4 py-2.5 text-xs font-semibold ${
                    draft.energySources.includes(e.id) ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-[var(--studio-border)]'
                  }`}
                >
                  {e.label[locale] ?? e.label.en}
                </button>
              ))}
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
              <Row label={t('buildingType')} value={BUILDING_TYPES.find((b) => b.id === draft.buildingType)?.label[locale] ?? ''} />
              <Row label={t('smartBuilding')} value={draft.smartBuilding ? (draft.smartProtocol ?? '—') : t('no')} />
              <Row label="HVAC" value={draft.hvacMode === 'auto' ? t('hvacAuto') : draft.hvacTypes.join(', ')} />
              <Row label={t('wizardEnergy')} value={draft.energySources.join(', ')} />
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
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-white"
            >
              {t('next')} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => finish(false)} className="rounded-lg border border-[var(--studio-border)] px-4 py-2 text-xs font-semibold">
                {t('wizardBlank')}
              </button>
              <button onClick={() => finish(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white">
                <Sparkles className="h-4 w-4" /> {t('wizardGenerate')}
              </button>
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
      onClick={onClick}
      className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${active ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300' : 'border-[var(--studio-border)]'}`}
    >
      {label}
    </button>
  );
}
