'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, DocumentTextIcon, NoSymbolIcon, PlayIcon, PauseCircleIcon } from '@heroicons/react/24/outline';

type Ticket = {
  id: string;
  siteName: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

type CompanyDetail = {
  id: string;
  companyName: string;
  pocName: string;
  pocPhone: string;
  certificateUrl: string | null;
  status: string;
  requester?: { id: string; username: string; name: string | null; phone: string; company: string | null };
  ticketCount: number;
  siteCount: number;
  tickets: Ticket[];
  createdAt: string;
};

export default function AdminCompanyDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/companies/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.company) setCompany(data.company);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const setStatus = async (status: string) => {
    if (!id) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success && company) setCompany({ ...company, status });
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  if (loading || !company) {
    return (
      <div className="py-12 text-center text-gray-500">
        {loading ? 'Loading...' : 'Company not found.'}
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/admin/companies"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Back to companies
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{company.companyName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              POC: {company.pocName} · {company.pocPhone}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                company.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : company.status === 'SUSPENDED'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              {company.status}
            </span>
            {company.status !== 'ACTIVE' && (
              <button
                type="button"
                onClick={() => setStatus('ACTIVE')}
                disabled={updating}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-sm font-medium disabled:opacity-50"
              >
                <PlayIcon className="w-4 h-4" />
                Activate
              </button>
            )}
            {company.status !== 'SUSPENDED' && (
              <button
                type="button"
                onClick={() => setStatus('SUSPENDED')}
                disabled={updating}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-sm font-medium disabled:opacity-50"
              >
                <PauseCircleIcon className="w-4 h-4" />
                Suspend
              </button>
            )}
            {company.status !== 'BLOCKED' && (
              <button
                type="button"
                onClick={() => setStatus('BLOCKED')}
                disabled={updating}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-sm font-medium disabled:opacity-50"
              >
                <NoSymbolIcon className="w-4 h-4" />
                Block
              </button>
            )}
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Company</dt>
                <dd className="font-medium text-gray-900">{company.companyName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">POC name</dt>
                <dd className="font-medium text-gray-900">{company.pocName}</dd>
              </div>
              <div>
                <dt className="text-gray-500">POC phone</dt>
                <dd className="font-medium text-gray-900">{company.pocPhone}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Certificate / license</dt>
                <dd>
                  {company.certificateUrl ? (
                    <a
                      href={company.certificateUrl}
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
                </dd>
              </div>
              {company.requester && (
                <>
                  <div>
                    <dt className="text-gray-500">Dashboard username</dt>
                    <dd className="font-mono text-gray-900">{company.requester.username}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Created</dt>
                    <dd className="text-gray-900">{formatDate(company.createdAt)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Counts</h2>
            <div className="flex gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-2xl font-bold text-gray-900">{company.ticketCount}</p>
                <p className="text-xs text-gray-500">Tickets</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-2xl font-bold text-gray-900">{company.siteCount}</p>
                <p className="text-xs text-gray-500">Sites</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Company tickets</h2>
          {company.tickets.length === 0 ? (
            <p className="text-sm text-gray-500">No tickets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 pr-4">Site</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Created</th>
                    <th className="pb-2">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {company.tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-4 font-medium text-gray-900">{t.siteName ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            t.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{formatDate(t.createdAt)}</td>
                      <td className="py-2 text-gray-600">{t.completedAt ? formatDate(t.completedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            <Link href="/admin/visitor-requests" className="text-blue-600 hover:underline">
              View all visitor requests →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
