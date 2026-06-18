'use client';

import { useStudio } from '../lib/store';
import { getCatalogEntry } from '../lib/catalog';
import { catalogAlternatives, specRows } from '../lib/spec-display';
import { useT } from './hooks';

type Props = {
  nodeId: string;
  catalogId: string;
  label: string;
  lengthM?: number;
  rotation?: number;
};

/** Hover card: specs, cable length, rotation, and quick model replace. */
export function NodeHoverCard({ nodeId, catalogId, label, lengthM, rotation }: Props) {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const replaceNodeCatalog = useStudio((s) => s.replaceNodeCatalog);
  const updateParam = useStudio((s) => s.updateNodeParam);
  const entry = getCatalogEntry(catalogId);
  if (!entry) return null;

  const specs = specRows(entry).slice(0, 6);
  const alternatives = catalogAlternatives(entry);
  const name = entry.name[locale] ?? entry.name.en;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-[220px] -translate-x-1/2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)] p-2.5 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 truncate text-[11px] font-bold text-[var(--studio-text)]">{label}</div>
      <div className="mb-2 truncate text-[9px] text-[var(--studio-muted)]">{name} · {entry.model}</div>

      <div className="mb-2 grid grid-cols-2 gap-1">
        {specs.map((row) => (
          <div key={row.label} className="rounded-md bg-[var(--studio-bg)] px-1.5 py-1">
            <div className="text-[8px] text-[var(--studio-muted)]">{row.label}</div>
            <div className="text-[10px] font-semibold text-[var(--studio-text)]">{row.value}</div>
          </div>
        ))}
      </div>

      {entry.domain === 'cable' && (
        <div className="mb-2 space-y-1.5">
          <label className="block text-[8px] font-medium text-[var(--studio-muted)]">{t('length')}</label>
          <input
            type="number"
            min={1}
            value={lengthM ?? 20}
            onChange={(e) => updateParam(nodeId, 'lengthM', Number(e.target.value))}
            className="pointer-events-auto w-full rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1 text-[10px] text-[var(--studio-text)] outline-none focus:border-cyan-400"
          />
          <div className="flex gap-1">
            {[0, 90, 180, 270].map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => updateParam(nodeId, 'rotation', deg)}
                className={`pointer-events-auto flex-1 rounded-md py-0.5 text-[9px] font-semibold transition
                  ${(rotation ?? 0) === deg ? 'bg-cyan-500 text-white' : 'bg-[var(--studio-hover)] text-[var(--studio-muted)]'}`}
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>
      )}

      {alternatives.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-[8px] font-medium text-[var(--studio-muted)]">{t('replaceModel')}</span>
          <select
            value={catalogId}
            onChange={(e) => replaceNodeCatalog(nodeId, e.target.value)}
            className="pointer-events-auto w-full rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1 text-[10px] text-[var(--studio-text)]"
          >
            <option value={catalogId}>{entry.model}</option>
            {alternatives.map((a) => (
              <option key={a.id} value={a.id}>
                {a.manufacturer} {a.model}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
