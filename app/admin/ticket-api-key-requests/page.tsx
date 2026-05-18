'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckIcon, XMarkIcon, KeyIcon, NoSymbolIcon } from '@heroicons/react/24/outline';

type Requester = {
  id: string;
  username: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  serviceSlug: string | null;
};

type ApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type AccessRequest = {
  id: string;
  useCase: string | null;
  label: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requester: Requester;
  apiKey: ApiKeyRow | null;
};

export default function AdminTicketApiKeyRequestsPage() {
  const [list, setList] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<{ id: string; apiKey: string; keyPrefix: string } | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ticket-api-key-requests');
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
      const res = await fetch(`/api/admin/ticket-api-key-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rejectionReason: action === 'reject' ? rejectReason[id] ?? '' : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: data.status } : r))
        );
        if (action === 'approve' && data.apiKey) {
          setApproveResult({ id, apiKey: data.apiKey, keyPrefix: data.keyPrefix });
        }
        await load();
      } else {
        alert(data.message || 'Action failed');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionId(null);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm('Revoke this API key? External integrations will stop working immediately.')) return;
    try {
      const res = await fetch(`/api/admin/ticket-api-keys/${keyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const data = await res.json();
      if (data.success) await load();
      else alert(data.message || 'Revoke failed');
    } catch (e) {
      console.error(e);
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
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Ticket API key requests</h1>
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
          <p className="text-sm font-medium text-emerald-800 mb-2">
            API key generated (copy now — shown once):
          </p>
          <p className="text-sm text-emerald-900 font-mono break-all select-all">{approveResult.apiKey}</p>
          <p className="text-xs text-emerald-700 mt-2">
            Prefix: {approveResult.keyPrefix} · Use{' '}
            <code className="bg-emerald-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code> on{' '}
            <code className="bg-emerald-100 px-1 rounded">POST /api/tickets</code>
          </p>
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Company and private-workspace accounts request API access from the mobile profile. Approve to issue a
        key for automated ticket creation into their account.
      </p>

      {loading && list.length === 0 ? (
        <p className="text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500">No API key requests yet.</p>
      ) : (
        <div className="space-y-4">
          {list.map((r) => (
            <article
              key={r.id}
              className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {r.requester.company || r.requester.name || r.requester.username}
                  </p>
                  <p className="text-sm text-gray-600">
                    @{r.requester.username} · {r.requester.role} · {r.requester.phone || '—'}
                  </p>
                  {r.label && <p className="text-sm text-gray-700 mt-1">Label: {r.label}</p>}
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.useCase}</p>
                  <p className="text-xs text-gray-400 mt-2">Submitted {formatDate(r.createdAt)}</p>
                  {r.rejectionReason && r.status === 'REJECTED' && (
                    <p className="text-sm text-red-600 mt-1">Reason: {r.rejectionReason}</p>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    r.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-800'
                      : r.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {r.status}
                </span>
              </div>

              {r.apiKey && !r.apiKey.revokedAt && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                  <KeyIcon className="w-4 h-4 text-emerald-600" />
                  <span className="font-mono">{r.apiKey.keyPrefix}…</span>
                  {r.apiKey.label && <span>({r.apiKey.label})</span>}
                  {r.apiKey.lastUsedAt && (
                    <span className="text-xs text-gray-500">
                      Last used {formatDate(r.apiKey.lastUsedAt)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => revokeKey(r.apiKey!.id)}
                    className="ml-auto inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium"
                  >
                    <NoSymbolIcon className="w-4 h-4" />
                    Revoke key
                  </button>
                </div>
              )}

              {r.status === 'PENDING' && (
                <div className="mt-4 flex flex-wrap gap-2 items-end">
                  <input
                    type="text"
                    placeholder="Rejection reason (optional)"
                    value={rejectReason[r.id] ?? ''}
                    onChange={(e) =>
                      setRejectReason((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    className="flex-1 min-w-[200px] text-sm border border-gray-300 rounded-lg px-3 py-2"
                  />
                  <button
                    type="button"
                    disabled={actionId === r.id}
                    onClick={() => handleAction(r.id, 'approve')}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckIcon className="w-4 h-4" />
                    Approve & generate key
                  </button>
                  <button
                    type="button"
                    disabled={actionId === r.id}
                    onClick={() => handleAction(r.id, 'reject')}
                    className="inline-flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
