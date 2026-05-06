'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, FunnelIcon } from '@heroicons/react/24/outline';

type ConflictRow = {
  id: string;
  ticketId: string;
  siteName: string | null;
  siteCoordinator: string | null;
  inspectionResult: string;
  status: string;
  isMaintenanceConflict?: boolean;
  serviceSlug?: string | null;
  reportedAt?: string | null;
  updatedAt?: string | null;
  resolution?: string | null;
};

type Counts = {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  reInspection: number;
  maintenance: number;
  qc: number;
};

export default function AdminConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [serviceSlug, setServiceSlug] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== 'all') params.set('status', status);
      if (kind && kind !== 'all') params.set('kind', kind);
      if (q.trim()) params.set('q', q.trim());
      if (serviceSlug.trim()) params.set('serviceSlug', serviceSlug.trim());
      const res = await fetch(`/api/admin/conflicts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setConflicts(data.conflicts ?? []);
        setCounts(data.counts ?? null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [status, kind, q, serviceSlug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const badge = (s: string) => {
    const u = String(s ?? '').toLowerCase();
    if (u === 'pending') return 'bg-amber-500/20 text-amber-200 border border-amber-500/40';
    if (u === 'resolved') return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30';
    if (u === 're_inspection') return 'bg-sky-500/15 text-sky-100 border border-sky-500/35';
    return 'bg-slate-700/50 text-slate-200 border border-white/10';
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Manage conflicts</h1>
          <p className="text-sm text-slate-400 mt-1">
            QC and maintenance dispute cases flagged on tickets ({counts?.total ?? '—'} total).
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: counts.total },
            { label: 'Open (actionable)', value: counts.open },
            { label: 'Pending', value: counts.pending },
            { label: 'Resolved', value: counts.resolved },
            { label: 'Re-inspection', value: counts.reInspection },
            { label: 'Maintenance / QC', value: `${counts.maintenance} / ${counts.qc}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950 px-4 py-3 shadow-lg shadow-black/20"
            >
              <div className="text-xs text-slate-500 font-medium">{label}</div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <FunnelIcon className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white"
          >
            <option value="all">Status: All</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="re_inspection">Re-inspection</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white"
          >
            <option value="all">Kind: All</option>
            <option value="qc">QC inspections</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <input
            value={serviceSlug}
            onChange={(e) => setServiceSlug(e.target.value)}
            placeholder="Service slug filter (optional)"
            className="rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600 min-w-[200px]"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search site name, coordinator, ticket id…"
            className="flex-1 min-w-[220px] rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/80">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : conflicts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No conflicts match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/90 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Kind</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-white font-medium">
                      {c.siteName ?? '—'}
                      {c.siteCoordinator ? (
                        <div className="text-xs font-normal text-slate-400 mt-0.5">{c.siteCoordinator}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {c.isMaintenanceConflict ? (
                        <span className="text-orange-300">Maintenance</span>
                      ) : (
                        <span className="text-cyan-200">QC</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 capitalize">{String(c.inspectionResult).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold capitalize ${badge(c.status)}`}>
                        {String(c.status).replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.serviceSlug ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/en/ticket/${c.ticketId}`}
                        className="text-cyan-400 hover:underline font-mono text-xs"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.ticketId.slice(0, 8)}…
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
