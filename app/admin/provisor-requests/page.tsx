'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon, FunnelIcon, BanknotesIcon } from '@heroicons/react/24/outline';

const IRAQ_PROVINCES = [
  'Al-Anbar', 'Babil', 'Baghdad', 'Basra', 'Dhi Qar', 'Al-Qadisiyyah', 'Diyala', 'Duhok',
  'Erbil', 'Halabja', 'Karbala', 'Kirkuk', 'Maysan', 'Muthanna', 'Najaf', 'Ninawa',
  'Salah Al-Din', 'Sulaymaniyah', 'Wasit',
];

type ProvisorRequest = {
  id: string;
  status: string;
  technique: string;
  taskCategory: string | null;
  roleScope: string | null;
  assignmentScope: string | null;
  province: string;
  phone: string;
  name: string | null;
  siteName: string | null;
  siteCoordinator: string | null;
  displayCompany: string | null;
  createdAt: string;
  requesterRole: string | null;
  privateCompanyName: string | null;
};

type Counts = {
  total: number;
  filtered: number;
  pendingTotal: number;
  pendingByStatus: Record<string, number>;
  pendingByCategory: Record<string, number>;
};

export default function AdminProvisorRequestsPage() {
  const [list, setList] = useState<ProvisorRequest[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    province: '',
    taskCategory: '',
    requesterRole: '',
    assignmentScope: '',
    technique: '',
    q: '',
    dateFrom: '',
    dateTo: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const qs = params.toString();
      const res = await fetch(`/api/admin/provisor-requests${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setList(data.requests);
        setCounts(data.counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [
    filters.status,
    filters.province,
    filters.taskCategory,
    filters.requesterRole,
    filters.assignmentScope,
    filters.technique,
    filters.dateFrom,
    filters.dateTo,
  ]);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const categoryLabel = (c: string | null) => {
    if (c === 'QUALITY') return 'Inspection / QC';
    if (c === 'SUPERVISION') return 'Supervision';
    if (c === 'MAINTENANCE') return 'Maintenance';
    return c ?? '—';
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Provisor requests</h1>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-800 uppercase font-medium flex items-center gap-1">
              <BanknotesIcon className="w-4 h-4" /> Pending budget
            </p>
            <p className="text-2xl font-bold text-amber-900">{counts.pendingTotal}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">QC / Inspection</p>
            <p className="text-xl font-bold">{counts.pendingByCategory?.QUALITY ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Supervision</p>
            <p className="text-xl font-bold">{counts.pendingByCategory?.SUPERVISION ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Maintenance</p>
            <p className="text-xl font-bold">{counts.pendingByCategory?.MAINTENANCE ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 uppercase">Showing / total</p>
            <p className="text-xl font-bold">
              {counts.filtered} / {counts.total}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-sm text-gray-700 space-y-1">
        <p className="font-semibold flex items-center gap-1">
          <FunnelIcon className="w-4 h-4" /> Role routing
        </p>
        <p>
          <strong>Engineers</strong> handle QUALITY + SUPERVISION by province (company, personal, workspace when
          scope allows).
        </p>
        <p>
          <strong>Technicians</strong> handle MAINTENANCE with the same province and requester-type rules.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-4 p-4 bg-white rounded-xl border border-gray-200">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {['PENDING', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.taskCategory}
          onChange={(e) => setFilters((f) => ({ ...f, taskCategory: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        >
          <option value="">All categories</option>
          <option value="QUALITY">Inspection / QC</option>
          <option value="SUPERVISION">Supervision</option>
          <option value="MAINTENANCE">Maintenance</option>
        </select>
        <select
          value={filters.requesterRole}
          onChange={(e) => setFilters((f) => ({ ...f, requesterRole: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        >
          <option value="">All requester roles</option>
          {['COMPANY', 'PERSONAL', 'ENGINEER', 'TECHNICIAN', 'MANAGER', 'COORDINATOR'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filters.province}
          onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        >
          <option value="">All provinces</option>
          {IRAQ_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="border rounded-lg px-2 py-2 text-sm md:col-span-2"
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          className="border rounded-lg px-2 py-2 text-sm"
        />
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
        >
          Apply search
        </button>
      </div>

      {loading && list.length === 0 ? (
        <p className="text-center text-gray-500 py-12">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-center text-gray-500 py-12 rounded-lg border bg-gray-50">No requests match filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Province</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Workspace</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : r.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{categoryLabel(r.taskCategory)}</td>
                  <td className="px-3 py-2">{r.province}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate" title={r.siteName ?? ''}>
                    {r.siteName ?? '—'}
                  </td>
                  <td className="px-3 py-2 max-w-[120px] truncate">{r.displayCompany ?? '—'}</td>
                  <td className="px-3 py-2">{r.requesterRole ?? '—'}</td>
                  <td className="px-3 py-2 max-w-[100px] truncate">{r.privateCompanyName ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/visitor-requests/${r.id}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <EyeIcon className="w-4 h-4" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
