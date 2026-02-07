'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, DocumentTextIcon, NoSymbolIcon, PlayIcon, PauseCircleIcon, EyeIcon } from '@heroicons/react/24/outline';

type Company = {
  id: string;
  companyName: string;
  pocName: string;
  pocPhone: string;
  certificateUrl: string | null;
  status: string;
  requesterId: string;
  requester?: { id: string; username: string; name: string | null; phone: string };
  ticketCount?: number;
  siteCount?: number;
  createdAt: string;
};

export default function AdminCompaniesPage() {
  const [list, setList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/companies');
      const data = await res.json();
      if (data.success && data.companies) setList(data.companies);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
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
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
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
          No companies yet. Approve company requests to create companies.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">POC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cert.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sites</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.companyName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.pocName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.pocPhone}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.certificateUrl ? (
                      <a
                        href={c.certificateUrl}
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
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.ticketCount ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.siteCount ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-medium"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                      Details
                    </Link>
                    {c.status !== 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => setStatus(c.id, 'ACTIVE')}
                        disabled={updatingId === c.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                        Activate
                      </button>
                    )}
                    {c.status !== 'SUSPENDED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(c.id, 'SUSPENDED')}
                        disabled={updatingId === c.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium disabled:opacity-50"
                      >
                        <PauseCircleIcon className="w-3.5 h-3.5" />
                        Suspend
                      </button>
                    )}
                    {c.status !== 'BLOCKED' && (
                      <button
                        type="button"
                        onClick={() => setStatus(c.id, 'BLOCKED')}
                        disabled={updatingId === c.id}
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
