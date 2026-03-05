'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, DocumentTextIcon, NoSymbolIcon, PlayIcon, PauseCircleIcon } from '@heroicons/react/24/outline';

type Requester = {
  id: string;
  username: string;
  name: string | null;
  phone: string;
  company: string | null;
  companyCertificationUrl: string | null;
  status: string;
  role: string;
  createdAt: string;
  ticketCount: number;
};

export default function AdminRequestersPage() {
  const [list, setList] = useState<Requester[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/requesters');
      const data = await res.json();
      if (data.success && data.requesters) setList(data.requesters);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/requesters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ticket requesters (users)</h1>
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

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
          No requesters yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certification</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.role === 'ENGINEER'
                          ? 'bg-amber-100 text-amber-800'
                          : r.role === 'TECHNICIAN'
                            ? 'bg-violet-100 text-violet-800'
                            : r.role === 'PERSONAL'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-cyan-100 text-cyan-800'
                      }`}
                    >
                      {r.role === 'ENGINEER'
                        ? 'Engineer'
                        : r.role === 'TECHNICIAN'
                          ? 'Technician'
                          : r.role === 'PERSONAL'
                            ? 'Personal'
                            : 'Company'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.company ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {r.companyCertificationUrl ? (
                      <a
                        href={r.companyCertificationUrl}
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
                        r.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.ticketCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    {r.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'ACTIVE')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                        Activate
                      </button>
                    )}
                    {r.status !== 'SUSPENDED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'SUSPENDED')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PauseCircleIcon className="w-3.5 h-3.5" />
                        Suspend
                      </button>
                    )}
                    {r.status !== 'BLOCKED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'BLOCKED')}
                        disabled={updatingId === r.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium disabled:opacity-50"
                      >
                        <NoSymbolIcon className="w-3.5 h-3.5" />
                        Block
                      </button>
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
