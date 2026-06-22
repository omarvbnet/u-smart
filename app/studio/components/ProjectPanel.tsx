'use client';

import { useMemo } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { BUILDING_TYPES, ALL_STANDARDS, type BuildingType } from '../lib/project';
import {
  isResidentialBuilding,
  bedroomRangeForBuilding,
  defaultBedroomsForBuilding,
  layoutSummary,
} from '../lib/engine/residential-layouts';
import { Building2, LayoutTemplate, Sparkles } from 'lucide-react';

export function ProjectPanel() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const designName = useStudio((s) => s.designName);
  const setDesignName = useStudio((s) => s.setDesignName);
  const project = useStudio((s) => s.project);
  const updateProject = useStudio((s) => s.updateProject);
  const toggleStandard = useStudio((s) => s.toggleStandard);
  const reopenWizard = useStudio((s) => s.reopenWizard);
  const map = useStudio((s) => s.map);
  const createMapFromZero = useStudio((s) => s.createMapFromZero);
  const applyBuildingLayout = useStudio((s) => s.applyBuildingLayout);
  const placeEngineeringLayout = useStudio((s) => s.placeEngineeringLayout);
  const rooms = useStudio((s) => s.rooms);

  const residential = isResidentialBuilding(project.buildingType);
  const bedRange = useMemo(() => bedroomRangeForBuilding(project.buildingType), [project.buildingType]);
  const preview = useMemo(
    () => (residential ? layoutSummary(project.buildingType, project.bedrooms, locale) : ''),
    [residential, project.buildingType, project.bedrooms, locale],
  );

  const setBedrooms = (n: number) => {
    const clamped = Math.min(bedRange.max, Math.max(bedRange.min, n));
    updateProject({ bedrooms: clamped });
  };

  const onBuildingTypeChange = (bt: BuildingType) => {
    updateProject({
      buildingType: bt,
      bedrooms: isResidentialBuilding(bt) ? defaultBedroomsForBuilding(bt) : project.bedrooms,
    });
  };

  const label = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--studio-muted)]';
  const input =
    'w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 py-2 text-xs text-[var(--studio-text)] outline-none focus:border-cyan-400';

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-bold text-[var(--studio-text)]">{t('project')}</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className={label}>{t('designTitle')}</label>
          <input className={input} value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="—" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>{t('client')}</label>
            <input className={input} value={project.client} onChange={(e) => updateProject({ client: e.target.value })} />
          </div>
          <div>
            <label className={label}>{t('consultant')}</label>
            <input className={input} value={project.consultant} onChange={(e) => updateProject({ consultant: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>{t('location')}</label>
          <input className={input} value={project.location} onChange={(e) => updateProject({ location: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>{t('reference')}</label>
            <input className={input} value={project.reference} onChange={(e) => updateProject({ reference: e.target.value })} />
          </div>
          <div>
            <label className={label}>{t('revision')}</label>
            <input className={input} value={project.revision} onChange={(e) => updateProject({ revision: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>{t('buildingType')}</label>
          <select
            className={input}
            value={project.buildingType}
            onChange={(e) => onBuildingTypeChange(e.target.value as BuildingType)}
          >
            {BUILDING_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label[locale] ?? b.label.en}
              </option>
            ))}
          </select>
        </div>

        {residential && project.designMode !== 'manual' && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">{t('buildingLayout')}</h4>
            </div>
            <p className="text-[10px] text-[var(--studio-muted)]">{preview}</p>
            <div>
              <label className={label}>{t('bedrooms')}</label>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--studio-border)] px-3 py-1 text-sm font-bold hover:border-emerald-400"
                  onClick={() => setBedrooms(project.bedrooms - 1)}
                  disabled={project.bedrooms <= bedRange.min}
                >
                  −
                </button>
                <span className="min-w-[2rem] text-center text-sm font-bold">{project.bedrooms}</span>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--studio-border)] px-3 py-1 text-sm font-bold hover:border-emerald-400"
                  onClick={() => setBedrooms(project.bedrooms + 1)}
                  disabled={project.bedrooms >= bedRange.max}
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => applyBuildingLayout({ bedrooms: project.bedrooms, engineering: false, resetMap: !map })}
                className="w-full rounded-lg border border-emerald-400/40 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-200"
              >
                {t('applyLayout')}
              </button>
              <button
                type="button"
                onClick={() => applyBuildingLayout({ bedrooms: project.bedrooms, engineering: true, resetMap: false })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('applyLayout')} + {t('regenerateEngineering')}
              </button>
              {rooms.length > 0 && (
                <button
                  type="button"
                  onClick={() => placeEngineeringLayout()}
                  className="w-full rounded-lg border border-[var(--studio-border)] py-2 text-xs font-semibold text-[var(--studio-text)] hover:bg-[var(--studio-hover)]"
                >
                  {t('regenerateEngineering')}
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className={label}>{t('standards')}</label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_STANDARDS.map((code) => {
              const active = project.standards.includes(code);
              return (
                <button
                  key={code}
                  onClick={() => toggleStandard(code)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
                    active
                      ? 'border-cyan-400 bg-cyan-500/15 text-cyan-300'
                      : 'border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)]'
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] p-3 text-xs space-y-1">
          <div><span className="text-[var(--studio-muted)]">{t('smartBuilding')}:</span> {project.smartBuilding ? (project.smartProtocol ?? '—') : t('no')}</div>
          <div><span className="text-[var(--studio-muted)]">HVAC:</span> {project.hvacMode === 'auto' ? t('hvacAuto') : project.hvacTypes.join(', ')}</div>
          <div><span className="text-[var(--studio-muted)]">{t('wizardEnergy')}:</span> {project.energySources.join(', ')}</div>
          <div>
            <span className="text-[var(--studio-muted)]">{t('wizardFloorPlan')}:</span>{' '}
            {project.floorPlanSource === 'zero'
              ? t('floorPlanFromZero')
              : project.floorPlanSource === 'import'
                ? t('floorPlanImport')
                : t('floorPlanSkip')}
          </div>
        </div>

        {!map && (
          <button
            onClick={createMapFromZero}
            className="w-full rounded-lg border border-[var(--studio-border)] py-2 text-xs font-semibold text-[var(--studio-text)] hover:bg-[var(--studio-hover)]"
          >
            {t('createMapFromZero')}
          </button>
        )}

        <button
          onClick={reopenWizard}
          className="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-300"
        >
          {t('reopenWizard')}
        </button>
      </div>
    </div>
  );
}
