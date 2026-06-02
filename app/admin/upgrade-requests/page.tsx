'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  DocumentTextIcon,
  UserPlusIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';

type Counts = { pending: number; approved: number; rejected: number; total: number };

type IndividualRequest = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  province: string | null;
  evidenceUrl: string | null;
  status: string;
  rejectionReason: string | null;
  requesterId: string | null;
  createdAt: string;
  budgetIqd: number;
};

type PrivateRequest = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  status: string;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  budgetIqd: number;
};

type ApiResponse = {
  success: boolean;
  individualToCompany: IndividualRequest[];
  companyToPrivate: PrivateRequest[];
  counts: { individual: Counts; private: Counts; pendingTotal: number };
  budget: { currency: string; perType: Record<string, number>; pendingTotalIqd: number };
};

type Tab = 'individual' | 'private';

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function formatIqd(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} IQD`;
}

function resolveUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${typeof window !== 'undefined' ? window.location.origin : ''}${url}`;
  return url;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === 'PENDING'
      ? 'bg-amber-100 text-amber-800'
      : s === 'APPROVED'
        ? 'bg-emerald-100 text-emerald-800'
        : s === 'SUSPENDED'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-red-100 text-red-800';
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{s}</span>;
}

export default function AdminUpgradeRequestsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('individual');
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/upgrade-requests');
      const json = (await res.json()) as ApiResponse;
      if (json.success) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const individualAction = async (id: string, action: 'approve' | 'reject') => {
    setActionId(id);
    setActionError('');
    setActionNote('');
    try {
      const payload: { action: string; reason?: string } = { action };
      if (action === 'reject') {
        const reason = (rejectReason[id] || '').trim();
        if (!reason) {
          setActionError('Please provide a rejection reason.');
          setActionId(null);
          return;
        }
        payload.reason = reason;
      }
      const res = await fetch(`/api/admin/registration-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setActionNote(
          action === 'approve'
            ? 'Individual account upgraded to company. Approval email sent.'
            : 'Request rejected. Notification email sent.'
        );
        await load();
      } else {
        setActionError(json.message || 'Failed to process request.');
      }
    } catch (e) {
      console.error(e);
      setActionError('Network error while processing request.');
    } finally {
      setActionId(null);
    }
  };

  const privateAction = async (id: string, action: 'approve' | 'reject') => {
    setActionId(id);
    setActionError('');
    setActionNote('');
    try {
      const payload: { action: string; reason?: string } = { action };
      if (action === 'reject') {
        const reason = (rejectReason[id] || '').trim();
        if (!reason) {
          setActionError('Please provide a rejection reason.');
          setActionId(null);
          return;
        }
        payload.reason = reason;
      }
      const res = await fetch(`/api/admin/private-companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setActionNote(
          action === 'approve'
            ? 'Private workspace approved. Approval email sent to the owner.'
            : 'Workspace request rejected.'
        );
        await load();
      } else {
        setActionError(json.message || 'Failed to process request.');
      }
    } catch (e) {
      console.error(e);
      setActionError('Network error while processing request.');
    } finally {
      setActionId(null);
    }
  };

  const individual = data?.individualToCompany ?? [];
  const privateList = data?.companyToPrivate ?? [];
  const counts = data?.counts;
  const budget = data?.budget;

  const pendingTotal = counts?.pendingTotal ?? 0;

  const summaryCards = useMemo(
    () => [
      {
        label: 'Pending upgrades',
        value: pendingTotal,
        icon: ArrowPathIcon,
        accent: 'text-amber-600 bg-amber-50 border-amber-100',
      },
      {
        label: 'Individual → Company',
        value: counts?.individual.pending ?? 0,
        sub: `${counts?.individual.total ?? 0} total`,
        icon: UserPlusIcon,
        accent: 'text-indigo-600 bg-indigo-50 border-indigo-100',
      },
      {
        label: 'Company → Private',
        value: counts?.private.pending ?? 0,
        sub: `${counts?.private.total ?? 0} total`,
        icon: BuildingOffice2Icon,
        accent: 'text-cyan-600 bg-cyan-50 border-cyan-100',
      },
      {
        label: 'Pending budget',
        value: budget ? formatIqd(budget.pendingTotalIqd) : '—',
        icon: BanknotesIcon,
        accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      },
    ],
    [pendingTotal, counts, budget]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account upgrade requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve account upgrades. Budget figures are indicative (IQD); the fee is handled offline.
          </p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{c.label}</span>
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${c.accent}`}>
                  <Icon className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{c.value}</div>
              {c.sub && <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('individual')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'individual'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Individual → Company
          {counts && counts.individual.pending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">
              {counts.individual.pending}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('private')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'private'
              ? 'border-cyan-600 text-cyan-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Company → Private Company
          {counts && counts.private.pending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">
              {counts.private.pending}
            </span>
          )}
        </button>
      </div>

      {actionNote && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
          {actionNote}
        </div>
      )}
      {actionError && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{actionError}</div>
      )}

      {loading && !data ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : tab === 'individual' ? (
        <IndividualTable
          rows={individual}
          actionId={actionId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          onAction={individualAction}
        />
      ) : (
        <PrivateTable
          rows={privateList}
          actionId={actionId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          onAction={privateAction}
        />
      )}
    </div>
  );
}

function RejectInline({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(id, e.target.value)}
      placeholder="Reject reason (required)"
      className="mt-2 w-56 px-2 py-1 text-xs rounded border border-gray-300"
    />
  );
}

function ActionButtons({
  id,
  status,
  rejectionReason,
  busy,
  onAction,
  rejectValue,
  onRejectChange,
}: {
  id: string;
  status: string;
  rejectionReason: string | null;
  busy: boolean;
  onAction: (id: string, action: 'approve' | 'reject') => void;
  rejectValue: string;
  onRejectChange: (id: string, v: string) => void;
}) {
  if (status.toUpperCase() !== 'PENDING') {
    return status.toUpperCase() === 'REJECTED' && rejectionReason ? (
      <div className="text-xs text-red-600">Reason: {rejectionReason}</div>
    ) : (
      <span className="text-xs text-gray-400">—</span>
    );
  }
  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAction(id, 'approve')}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-medium disabled:opacity-50"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => onAction(id, 'reject')}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium disabled:opacity-50"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
      <RejectInline id={id} value={rejectValue} onChange={onRejectChange} />
    </div>
  );
}

function IndividualTable({
  rows,
  actionId,
  rejectReason,
  setRejectReason,
  onAction,
}: {
  rows: IndividualRequest[];
  actionId: string | null;
  rejectReason: Record<string, string>;
  setRejectReason: Dispatch<SetStateAction<Record<string, string>>>;
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  const onRejectChange = (id: string, v: string) => setRejectReason((prev) => ({ ...prev, [id]: v }));
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
        No individual → company upgrade requests yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Province</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Budget</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verification</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50 align-top">
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.phone ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.email ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.province ?? '—'}</td>
              <td className="px-4 py-3 text-sm">
                <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
                  {formatIqd(r.budgetIqd)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {r.evidenceUrl ? (
                  <a
                    href={resolveUrl(r.evidenceUrl)}
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
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-sm">
                <ActionButtons
                  id={r.id}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  busy={actionId === r.id}
                  onAction={onAction}
                  rejectValue={rejectReason[r.id] || ''}
                  onRejectChange={onRejectChange}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrivateTable({
  rows,
  actionId,
  rejectReason,
  setRejectReason,
  onAction,
}: {
  rows: PrivateRequest[];
  actionId: string | null;
  rejectReason: Record<string, string>;
  setRejectReason: Dispatch<SetStateAction<Record<string, string>>>;
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  const onRejectChange = (id: string, v: string) => setRejectReason((prev) => ({ ...prev, [id]: v }));
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 rounded-lg border border-gray-200 bg-gray-50">
        No company → private workspace requests yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workspace</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Budget</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Logo</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50 align-top">
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.createdAt)}</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {r.name}
                {r.description && <div className="text-xs text-gray-400 font-normal mt-0.5 max-w-xs truncate">{r.description}</div>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.ownerName ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.ownerPhone ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{r.ownerEmail ?? '—'}</td>
              <td className="px-4 py-3 text-sm">
                <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100">
                  {formatIqd(r.budgetIqd)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {r.logoUrl ? (
                  <a
                    href={resolveUrl(r.logoUrl)}
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
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-sm">
                <ActionButtons
                  id={r.id}
                  status={r.status}
                  rejectionReason={r.rejectionReason}
                  busy={actionId === r.id}
                  onAction={onAction}
                  rejectValue={rejectReason[r.id] || ''}
                  onRejectChange={onRejectChange}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
