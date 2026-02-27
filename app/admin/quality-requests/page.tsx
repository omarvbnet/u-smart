'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon, FunnelIcon, BanknotesIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type NcrResubmission = { at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] };
type QualityRequest = {
  id: string;
  status: string;
  technique: string;
  phone: string;
  province: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  completedAt: string | null;
  siteName: string | null;
  siteCoordinator: string | null;
  slaHours: number | null;
  displayCompany: string | null;
  inspectionResult: string | null;
  inspectionComments: string | null;
  assignedEngineerId: string | null;
  assignedEngineerName: string | null;
  ncrReason?: string | null;
  ncrImageUrls?: string[];
  ncrResubmissions?: NcrResubmission[];
};

export default function AdminQualityRequestsPage() {
  const [list, setList] = useState<QualityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingNcrResubmitCount, setPendingNcrResubmitCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    result: '',
    status: '',
    id: '',
    siteId: '',
    company: '',
    engineer: '',
  });

  const syncCompany = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/quality-requests/backfill-company', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await load();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.result) params.set('result', filters.result);
      if (filters.status) params.set('status', filters.status);
      if (filters.id) params.set('id', filters.id);
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.company) params.set('company', filters.company);
      if (filters.engineer) params.set('engineer', filters.engineer);
      const qs = params.toString();
      const res = await fetch(`/api/admin/quality-requests${qs ? `?${qs}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setList(data.requests);
        setPendingCount(data.pendingCount ?? 0);
        setPendingNcrResubmitCount(data.pendingNcrResubmitCount ?? 0);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.result, filters.status, filters.id, filters.siteId, filters.company, filters.engineer]);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const getResultLabel = (r: string | null) => {
    if (!r) return '—';
    const map: Record<string, string> = {
      accepted: 'Accepted',
      accepted_with_comments: 'Accepted w/ comments',
      not_accepted: 'NOT accepted',
      ncr: 'NCR',
      in_progress: 'In progress',
    };
    return map[r] ?? r;
  };

  // "Review" badge: ticket needs admin action (status != COMPLETED and last entry is requester resubmit)
  const isAwaitingAdminNcr = (r: QualityRequest) => {
    if ((r.status || '').toUpperCase() === 'COMPLETED') return false;
    const subs = r.ncrResubmissions || [];
    if (subs.length === 0) return false;
    const last = subs[subs.length - 1];
    return last.by === 'requester' && last.action === 'resubmit';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-800',
      ON_SITE: 'bg-cyan-100 text-cyan-800',
      IN_PROGRESS: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
    };
    return styles[status] ?? 'bg-gray-100 text-gray-800';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quality Control Requests</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ncr-resubmissions"
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-medium"
          >
            <ExclamationTriangleIcon className="w-5 h-5" />
            NCR resubmissions
            {pendingNcrResubmitCount > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold">{pendingNcrResubmitCount}</span>
            )}
          </Link>
          <button
            type="button"
            onClick={syncCompany}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
            Sync Company Data
          </button>
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
      </div>

      {/* Budget, NCR resubmissions & Pending counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex items-center gap-2 text-amber-800 mb-1">
            <BanknotesIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Pending (Budget)</span>
          </div>
          <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
          <p className="text-xs text-amber-700 mt-0.5">QC tickets awaiting action</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
          <div className="flex items-center gap-2 text-rose-800 mb-1">
            <ExclamationTriangleIcon className="w-5 h-5" />
            <span className="text-sm font-medium">NCR resubmitted</span>
          </div>
          <p className="text-2xl font-bold text-rose-900">{pendingNcrResubmitCount}</p>
          <p className="text-xs text-rose-700 mt-0.5">Requester resubmitted — needs your review</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-gray-700 mb-1">
            <span className="text-sm font-medium">Total QC requests</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-center gap-2 text-emerald-800 mb-1">
            <span className="text-sm font-medium">Displayed</span>
          </div>
          <p className="text-2xl font-bold text-emerald-900">{list.length}</p>
          <p className="text-xs text-emerald-700 mt-0.5">After filters</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <FunnelIcon className="w-4 h-4" />
          Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Inspection result</label>
            <select
              value={filters.result}
              onChange={(e) => setFilters((f) => ({ ...f, result: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All</option>
              <option value="accepted">Accepted</option>
              <option value="accepted_with_comments">Accepted w/ comments</option>
              <option value="not_accepted">NOT accepted</option>
              <option value="ncr">NCR</option>
              <option value="in_progress">In progress</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="ON_SITE">On site</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ticket ID</label>
            <input
              type="text"
              value={filters.id}
              onChange={(e) => setFilters((f) => ({ ...f, id: e.target.value }))}
              placeholder="Filter by ID"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Site ID / Coordinator</label>
            <input
              type="text"
              value={filters.siteId}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
              placeholder="Site or coordinator"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
            <input
              type="text"
              value={filters.company}
              onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
              placeholder="Filter by company"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Engineer</label>
            <input
              type="text"
              value={filters.engineer}
              onChange={(e) => setFilters((f) => ({ ...f, engineer: e.target.value }))}
              placeholder="Filter by engineer name"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilters({ result: '', status: '', id: '', siteId: '', company: '', engineer: '' })}
          className="mt-3 text-sm text-gray-600 hover:text-gray-900"
        >
          Clear filters
        </button>
      </div>

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No quality control requests found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technique</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engineer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">NCR / Resubmissions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${isAwaitingAdminNcr(r) ? 'bg-rose-50/60 border-l-4 border-l-rose-500' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">
                    <span className="inline-flex items-center gap-1.5">
                      {isAwaitingAdminNcr(r) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold uppercase" title="Requester resubmitted NCR — needs your review">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                          Review
                        </span>
                      )}
                      #{r.id.slice(-8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.siteName ?? r.siteCoordinator ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{String(r.displayCompany || '').trim() || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.technique}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {r.assignedEngineerName ? (
                      <span className="font-medium">{r.assignedEngineerName}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.inspectionResult === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                        r.inspectionResult === 'accepted_with_comments' ? 'bg-amber-100 text-amber-800' :
                        r.inspectionResult === 'not_accepted' || r.inspectionResult === 'ncr' ? 'bg-red-100 text-red-800' :
                        r.inspectionResult === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {getResultLabel(r.inspectionResult)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.inspectionResult === 'ncr' && (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.ncrResubmissions && r.ncrResubmissions.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                            {r.ncrResubmissions.length} resubmission{r.ncrResubmissions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {r.ncrReason && (
                          <span className="text-xs text-gray-500 max-w-[180px] truncate" title={r.ncrReason}>{r.ncrReason}</span>
                        )}
                      </span>
                    )}
                    {r.inspectionResult !== 'ncr' && '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/admin/visitor-requests/${r.id}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
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
