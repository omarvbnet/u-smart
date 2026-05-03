'use client';

import { useState, useEffect } from 'react';
import { Wrench, ClipboardCheck, PlusIcon, TrashIcon } from 'lucide-react';

type Technique = {
  id: string;
  category: string;
  slug: string;
  labelAr: string;
  labelEn: string | null;
  sortOrder: number;
  active: boolean;
};

export default function AdminProvisorTechniquesPage() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<'INSPECTION_QC' | 'MAINTENANCE'>('INSPECTION_QC');
  const [slug, setSlug] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/provisor-techniques');
      const data = await res.json();
      if (data.success && data.techniques) setTechniques(data.techniques);
      else setError(data.message || 'Failed to load');
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = (cat: 'INSPECTION_QC' | 'MAINTENANCE') => {
    setCategory(cat);
    setSlug('');
    setLabelAr('');
    setLabelEn('');
    setSortOrder(0);
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/provisor-techniques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          slug,
          labelAr,
          labelEn: labelEn.trim() || undefined,
          sortOrder,
          active: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        load();
      } else {
        setError(data.message || 'Failed');
      }
    } catch {
      setError('Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this technique? Existing tickets keep their stored slug.')) return;
    try {
      const res = await fetch(`/api/admin/provisor-techniques/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) load();
    } catch {
      /* ignore */
    }
  };

  const inspection = techniques.filter((t) => t.category === 'INSPECTION_QC');
  const maintenance = techniques.filter((t) => t.category === 'MAINTENANCE');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Provisor techniques</h1>
        <p className="text-gray-400 text-sm mt-1">
          Arabic labels are primary in the app; English is optional. Slugs are stored on tickets — avoid changing slugs after use.
        </p>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-white">Add technique</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-400">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'INSPECTION_QC' | 'MAINTENANCE')}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
              >
                <option value="INSPECTION_QC">Quality inspection</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Slug (stored on ticket)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white font-mono text-sm"
                placeholder="e.g. insulation_test"
                required
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-400">Label (Arabic) — primary</span>
              <input
                value={labelAr}
                onChange={(e) => setLabelAr(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
                required
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-gray-400">Label (English) optional</span>
              <input
                value={labelEn}
                onChange={(e) => setLabelEn(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400">Sort order</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
              />
            </label>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl bg-white/10 text-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-amber-400" />
                Quality inspection
              </h2>
              <button
                type="button"
                onClick={() => openCreate('INSPECTION_QC')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm"
              >
                <PlusIcon className="w-4 h-4" /> Add
              </button>
            </div>
            <ul className="space-y-2">
              {inspection.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/5 text-sm"
                >
                  <div>
                    <span className="text-white font-mono text-xs text-amber-200/90">{t.slug}</span>
                    <p className="text-gray-200">{t.labelAr}</p>
                    {t.labelEn && <p className="text-gray-500 text-xs">{t.labelEn}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="text-red-400 hover:text-red-300 p-2"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {inspection.length === 0 && <li className="text-gray-500 text-sm">No rows — run DB seed or add above.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-cyan-400" />
                Maintenance
              </h2>
              <button
                type="button"
                onClick={() => openCreate('MAINTENANCE')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-700/80 hover:bg-cyan-600 text-white text-sm"
              >
                <PlusIcon className="w-4 h-4" /> Add
              </button>
            </div>
            <ul className="space-y-2">
              {maintenance.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 py-2 border-b border-white/5 text-sm"
                >
                  <div>
                    <span className="text-white font-mono text-xs text-cyan-200/90">{t.slug}</span>
                    <p className="text-gray-200">{t.labelAr}</p>
                    {t.labelEn && <p className="text-gray-500 text-xs">{t.labelEn}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="text-red-400 hover:text-red-300 p-2"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {maintenance.length === 0 && <li className="text-gray-500 text-sm">No rows — run DB seed or add above.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
