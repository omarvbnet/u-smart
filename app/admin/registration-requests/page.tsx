'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon, XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

type RegistrationRequest = {
  id: string;
  legalName: string;
  phone: string;
  email: string;
  evidenceUrl: string;
  role: string;
  status: string;
  createdAt: string;
};

export default function AdminRegistrationRequestsPage() {
  const [list, setList] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<{ id: string; username: string; password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/registration-requests');
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
      const res = await fetch(`/api/admin/registration-requests/${id}`, {
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
          <h1 className="text-2xl font-bold text-gray-900">Registration requests</h1>
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
          <p className="text-sm font-medium text-emerald-800 mb-2">Credentials for new dashboard (share with user):</p>
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
          No registration requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Legal name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.legalName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.role === 'ENGINEER' ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'
                      }`}
                    >
                      {r.role === 'ENGINEER' ? 'Engineer' : 'Company'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <a
                      href={r.evidenceUrl.startsWith('http') ? r.evidenceUrl : r.evidenceUrl.startsWith('/') ? `${typeof window !== 'undefined' ? window.location.origin : ''}${r.evidenceUrl}` : r.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <DocumentTextIcon className="w-4 h-4" />
                      View
                    </a>
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
