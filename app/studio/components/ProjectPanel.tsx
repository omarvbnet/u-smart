'use client';

import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { BUILDING_TYPES, ALL_STANDARDS, type BuildingType } from '../lib/project';
import { Building2 } from 'lucide-react';

export function ProjectPanel() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const designName = useStudio((s) => s.designName);
  const setDesignName = useStudio((s) => s.setDesignName);
  const project = useStudio((s) => s.project);
  const updateProject = useStudio((s) => s.updateProject);
  const toggleStandard = useStudio((s) => s.toggleStandard);

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
            onChange={(e) => updateProject({ buildingType: e.target.value as BuildingType })}
          >
            {BUILDING_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label[locale] ?? b.label.en}
              </option>
            ))}
          </select>
        </div>

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
      </div>
    </div>
  );
}
