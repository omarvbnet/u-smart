'use client';

import { useCallback, useEffect, useState } from 'react';

type Kind = 'MAINTENANCE' | 'EXPENSE';
type Audience = 'INDIVIDUAL' | 'COMPANY' | 'BOTH';

type Reason = {
  id: string;
  kind: Kind;
  audience: Audience;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  usageCount: number;
};

const KIND_LABEL: Record<Kind, string> = {
  MAINTENANCE: 'Maintenance completion reason',
  EXPENSE: 'Ticket expense reason',
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  INDIVIDUAL: 'Individual (personal accounts)',
  COMPANY: 'Company accounts',
  BOTH: 'Both individual & company',
};

export default function AdminPlatformReasonsPage() {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<Kind | 'ALL'>('ALL');
  const [filterAudience, setFilterAudience] = useState<Audience | 'ALL'>('ALL');

  const [newKind, setNewKind] = useState<Kind>('MAINTENANCE');
  const [newAudience, setNewAudience] = useState<Audience>('BOTH');
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterKind !== 'ALL') params.set('kind', filterKind);
      if (filterAudience !== 'ALL') params.set('audience', filterAudience);
      const [rRes, kRes] = await Promise.all([
        fetch(`/api/admin/platform-reasons?${params.toString()}`),
        fetch(`/api/admin/platform-reasons/kpis?${params.toString()}`),
      ]);
      const rData = await rRes.json();
      const kData = await kRes.json();
      if (rData?.success) setReasons(rData.reasons as Reason[]);
      if (kData?.success) {
        const map: Record<string, number> = {};
        for (const row of kData.reasons as { id: string; usageCount: number }[]) {
          map[row.id] = row.usageCount;
        }
        setKpis(map);
      }
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterAudience]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!newLabel.trim()) return;
    const res = await fetch('/api/admin/platform-reasons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: newKind,
        audience: newAudience,
        label: newLabel.trim(),
        description: newDescription.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (data?.success) {
      setNewLabel('');
      setNewDescription('');
      load();
    } else {
      alert(data?.message ?? 'Failed to create.');
    }
  };

  const update = async (id: string, patch: Partial<Reason>) => {
    const res = await fetch(`/api/admin/platform-reasons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data?.success) load();
    else alert(data?.message ?? 'Update failed.');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this reason?')) return;
    const res = await fetch(`/api/admin/platform-reasons/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data?.success) load();
    else alert(data?.message ?? 'Delete failed.');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-white">Maintenance &amp; expense reasons</h1>
        <p className="text-gray-400 text-sm mt-1">
          Reasons shown to staff when closing a maintenance ticket or logging an expense for
          tickets created by <strong>individual</strong> or <strong>company</strong> accounts.
          Toggle <em>active</em> to enable/disable a reason on the app. KPIs count how often each
          reason has been selected.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-400 mr-1">Kind:</label>
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as Kind | 'ALL')}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5"
        >
          <option value="ALL">All</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="EXPENSE">Expense</option>
        </select>
        <label className="text-xs text-gray-400 ml-3 mr-1">Audience:</label>
        <select
          value={filterAudience}
          onChange={(e) => setFilterAudience(e.target.value as Audience | 'ALL')}
          className="bg-black/40 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5"
        >
          <option value="ALL">All</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="COMPANY">Company</option>
          <option value="BOTH">Both</option>
        </select>
      </div>

      {/* Add new */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">Add reason</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as Kind)}
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          >
            <option value="MAINTENANCE">Maintenance</option>
            <option value="EXPENSE">Expense</option>
          </select>
          <select
            value={newAudience}
            onChange={(e) => setNewAudience(e.target.value as Audience)}
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          >
            <option value="BOTH">Both</option>
            <option value="INDIVIDUAL">Individual</option>
            <option value="COMPANY">Company</option>
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
          />
        </div>
        <button
          type="button"
          onClick={create}
          disabled={!newLabel.trim()}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-50"
        >
          Add reason
        </button>
      </section>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : reasons.length === 0 ? (
        <p className="text-gray-500">No reasons.</p>
      ) : (
        <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-gray-400 bg-black/30">
              <tr>
                <th className="text-left px-3 py-2">Kind</th>
                <th className="text-left px-3 py-2">Audience</th>
                <th className="text-left px-3 py-2">Label</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2">Usage</th>
                <th className="text-left px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white">{KIND_LABEL[r.kind]}</td>
                  <td className="px-3 py-2 text-gray-300">{AUDIENCE_LABEL[r.audience]}</td>
                  <td className="px-3 py-2">
                    <div className="text-white">{r.label}</div>
                    {r.description && (
                      <div className="text-gray-500 text-xs">{r.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) => update(r.id, { active: e.target.checked })}
                      />
                      {r.active ? 'On' : 'Off'}
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right text-white">
                    {kpis[r.id] ?? r.usageCount}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-rose-400 hover:text-rose-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
