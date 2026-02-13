'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type NcrResubmission = { at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] };
type NcrRequest = {
  id: string;
  status: string;
  technique: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  siteName: string | null;
  siteCoordinator: string | null;
  displayCompany: string | null;
  inspectionResult: string | null;
  ncrReason?: string | null;
  ncrResubmissions?: NcrResubmission[];
};

export default function AdminNcrResubmissionsPage() {
  const [list, setList] = useState<NcrRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/quality-requests');
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        const withNcr = (data.requests as NcrRequest[]).filter(
          (r) => (r.ncrResubmissions?.length ?? 0) > 0
        );
        setList(withNcr);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const isAwaitingAdmin = (r: NcrRequest) => {
    if ((r.status || '').toUpperCase() === 'COMPLETED') return false;
    const subs = r.ncrResubmissions || [];
    if (subs.length === 0) return false;
    const last = subs[subs.length - 1];
    return last.by === 'requester' && last.action === 'resubmit';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-7 h-7 text-rose-500" />
            NCR resubmit requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tickets with requester NCR resubmissions (from requesters). All resubmission history is saved in each ticket report.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/quality-requests"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
          >
            ← Quality requests
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 mb-6">
        <p className="text-sm text-rose-800">
          <strong>Report view:</strong> Each ticket&apos;s full NCR resubmission timeline (comments and images) is saved in the ticket detail under &quot;NCR resubmissions (report)&quot; — even after the NCR is closed.
        </p>
      </div>

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No NCR resubmission requests found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resubmissions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-gray-50 ${isAwaitingAdmin(r) ? 'bg-rose-50/60 border-l-4 border-l-rose-500' : ''}`}
                >
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">
                    {isAwaitingAdmin(r) && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold uppercase mr-1">
                        Review
                      </span>
                    )}
                    #{r.id.slice(-8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{r.siteName ?? r.siteCoordinator ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{String(r.displayCompany || '').trim() || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.inspectionResult === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                        r.inspectionResult === 'ncr' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {r.inspectionResult ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      r.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      r.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <span className="font-medium">{r.ncrResubmissions?.length ?? 0}</span> resubmission{(r.ncrResubmissions?.length ?? 0) !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/admin/visitor-requests/${r.id}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <EyeIcon className="w-4 h-4" />
                      View report
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
