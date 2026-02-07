'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, CheckIcon, XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

type CompanyRequest = {
  id: string;
  companyName: string;
  pocName: string;
  pocPhone: string;
  certificateUrl: string | null;
  serviceSlug?: string;
  status: string;
  createdAt: string;
};

export default function AdminCompanyRequestsPage() {
  const [list, setList] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<{ id: string; username: string; password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/company-requests');
      const data = await res.json();
      if (data.success && data.requests) setList(data.requests);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionId(id);
    setApproveResult(null);
    try {
      const res = await fetch(`/api/admin/company-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status: data.status } : r)));
        if (action === 'approve' && data.credentials) {
          setApproveResult({ id, ...data.credentials });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionId(null);
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

  const pending = list.filter((r) => r.status === 'PENDING');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Company requests</h1>
          {pending.length > 0 && (
            <span className="px-2.5 py-0.5 text-sm font-medium rounded-full bg-amber-100 text-amber-800">
              {pending.length} pending
            </span>
          )}
        </div>
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

      {approveResult && (
        <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800 mb-2">Credentials for new dashboard (share with company):</p>
          <p className="text-sm text-emerald-900 font-mono">Username: {approveResult.username}</p>
          <p className="text-sm text-emerald-900 font-mono">Password: {approveResult.password}</p>
          <button
            type="button"
            onClick={() => setApproveResult(null)}
            className="mt-2 text-xs text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No company requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">POC name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">POC phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dashboard</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certificate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.companyName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.pocName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.pocPhone}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.serviceSlug === 'quality-control-supervision' ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'}`}>
                      {r.serviceSlug === 'quality-control-supervision' ? 'Quality Control' : 'Enterprise Networking'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.certificateUrl ? (
                      <a
                        href={r.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : r.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    {r.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(r.id, 'approve')}
                          disabled={actionId === r.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(r.id, 'reject')}
                          disabled={actionId === r.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium disabled:opacity-50"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    )}
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
