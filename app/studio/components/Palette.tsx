'use client';

import { useMemo, useState } from 'react';
import { PALETTE_GROUPS } from '../lib/catalog';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { Icon } from './lucide-icon';
import { ChevronDown, Search } from 'lucide-react';

export function Palette() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.map((g, i) => [g.domain, i < 2])),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PALETTE_GROUPS.map((g) => ({
      ...g,
      entries: q
        ? g.entries.filter(
            (e) =>
              e.name[locale]?.toLowerCase().includes(q) ||
              e.name.en.toLowerCase().includes(q) ||
              e.model.toLowerCase().includes(q) ||
              e.manufacturer.toLowerCase().includes(q),
          )
        : g.entries,
    })).filter((g) => g.entries.length > 0);
  }, [query, locale]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--studio-border)] p-3">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--studio-muted)]">{t('palette')}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 ltr:left-2.5 rtl:right-2.5 -translate-y-1/2 h-4 w-4 text-[var(--studio-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] py-2 ltr:pl-8 rtl:pr-8 px-3 text-sm text-[var(--studio-text)] outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((group) => {
          const isOpen = query.trim() ? true : open[group.domain];
          return (
            <div key={group.domain} className="mb-1">
              <button
                onClick={() => setOpen((o) => ({ ...o, [group.domain]: !o[group.domain] }))}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start hover:bg-[var(--studio-hover)]"
              >
                <Icon name={group.icon} className="h-4 w-4 text-cyan-400" />
                <span className="flex-1 text-sm font-semibold text-[var(--studio-text)]">{group.label[locale]}</span>
                <span className="text-[10px] text-[var(--studio-muted)]">{group.entries.length}</span>
                <ChevronDown className={`h-4 w-4 text-[var(--studio-muted)] transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-1 ltr:pl-2 rtl:pr-2">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/studio-catalog', entry.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className="group flex cursor-grab items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 hover:border-[var(--studio-border)] hover:bg-[var(--studio-hover)] active:cursor-grabbing"
                    >
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${entry.color}1f`, color: entry.color }}
                      >
                        <Icon name={entry.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-[var(--studio-text)]">{entry.name[locale]}</div>
                        <div className="truncate text-[10px] text-[var(--studio-muted)]">{entry.manufacturer}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
