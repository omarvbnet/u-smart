'use client';

import { useCallback, useEffect, useState } from 'react';

type IssueType = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
};

export default function AdminIssueReportTypesPage() {
  const [types, setTypes] = useState<IssueType[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/issue-report-types');
      const data = await res.json();
      if (data?.success) setTypes(data.types as IssueType[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!label.trim()) return;
    const res = await fetch('/api/admin/issue-report-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        sortOrder: Number(sortOrder) || 0,
      }),
    });
    const data = await res.json();
    if (data?.success) {
      setLabel('');
      setSlug('');
      setDescription('');
      setSortOrder('0');
      load();
    } else {
      alert(data?.message ?? 'Failed to create.');
    }
  };

  const update = async (id: string, patch: Partial<IssueType>) => {
    const res = await fetch(`/api/admin/issue-report-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data?.success) load();
    else alert(data?.message ?? 'Update failed.');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this type? Existing reports keep their label.')) return;
    const res = await fetch(`/api/admin/issue-report-types/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data?.success) load();
    else alert(data?.message ?? 'Delete failed.');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Issue report types</h1>
        <p className="text-gray-400 text-sm mt-1">
          These show up as the dropdown when users open the &ldquo;Report a problem&rdquo; sheet
          from the Proviser app profile screen. Deactivate a type to hide it from the app without
          deleting historical reports.
        </p>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Add type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (shown to users)"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Slug (optional, e.g. login_issue)"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm md:col-span-2"
          />
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="Sort order"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm w-32"
          />
        </div>
        <button
          type="button"
          onClick={create}
          disabled={!label.trim()}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-50"
        >
          Add type
        </button>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Existing types</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : types.length === 0 ? (
          <p className="text-gray-500 text-sm">No types yet.</p>
        ) : (
          <ul className="space-y-2">
            {types.map((t) => (
              <li
                key={t.id}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.label}</p>
                  <p className="text-gray-500 text-xs truncate">{t.slug}</p>
                  {t.description && (
                    <p className="text-gray-400 text-xs truncate">{t.description}</p>
                  )}
                </div>
                <label className="text-xs text-gray-300 flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={t.active}
                    onChange={(e) => update(t.id, { active: e.target.checked })}
                  />
                  Active
                </label>
                <input
                  type="number"
                  defaultValue={t.sortOrder}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== t.sortOrder) update(t.id, { sortOrder: v });
                  }}
                  className="w-16 rounded bg-black/40 border border-white/10 px-1.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="text-rose-400 hover:text-rose-300 text-xs"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
