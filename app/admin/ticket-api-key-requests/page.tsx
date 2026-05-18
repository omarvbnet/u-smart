'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  KeyIcon,
  NoSymbolIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';

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

type WorkspaceDepartment = { id: string; name: string };

type WorkspaceInfo = {
  companyId: string;
  companyName: string;
  departments: WorkspaceDepartment[];
  requiresDepartmentSelection: boolean;
};

type ApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string | null;
  allowedDepartmentIds?: string[];
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
  isPrivateWorkspaceRequester?: boolean;
  workspace?: WorkspaceInfo | null;
  allowedDepartments?: WorkspaceDepartment[];
};

type IntegrationExample = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  bodyWithDepartments: Array<{
    departmentId: string;
    departmentName: string;
    body: Record<string, unknown>;
  }>;
};

type ApproveResult = {
  id: string;
  apiKey: string;
  keyPrefix: string;
  selectedDepartments: WorkspaceDepartment[];
  workspace: { companyId: string; companyName: string } | null;
  integration: IntegrationExample;
};

const PRIVATE_ROLES = new Set(['MANAGER', 'COORDINATOR', 'COMPANY']);

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

export default function AdminTicketApiKeyRequestsPage() {
  const [list, setList] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [selectedDeptIds, setSelectedDeptIds] = useState<Record<string, string[]>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ticket-api-key-requests');
      const data = await res.json();
      if (data.success && data.requests) {
        setList(data.requests);
        setSelectedDeptIds((prev) => {
          const next = { ...prev };
          for (const r of data.requests as AccessRequest[]) {
            if (next[r.id]?.length) continue;
            if (r.workspace?.requiresDepartmentSelection && r.workspace.departments.length > 0) {
              next[r.id] = r.workspace.departments.map((d) => d.id);
            }
          }
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (r: AccessRequest) => {
    if (r.workspace?.requiresDepartmentSelection) {
      const picked = selectedDeptIds[r.id] ?? [];
      if (picked.length === 0) {
        alert('Select at least one department for this private workspace API key.');
        return;
      }
    }

    setActionId(r.id);
    setApproveResult(null);
    try {
      const res = await fetch(`/api/admin/ticket-api-key-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          departmentIds: selectedDeptIds[r.id] ?? [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.apiKey && data.integration) {
          setApproveResult({
            id: r.id,
            apiKey: data.apiKey,
            keyPrefix: data.keyPrefix,
            selectedDepartments: data.selectedDepartments ?? [],
            workspace: data.workspace ?? null,
            integration: data.integration,
          });
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

  const handleReject = async (id: string) => {
    setActionId(id);
    setApproveResult(null);
    try {
      const res = await fetch(`/api/admin/ticket-api-key-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectionReason: rejectReason[id] ?? '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setList((prev) =>
          prev.map((row) => (row.id === id ? { ...row, status: data.status } : row))
        );
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

  const toggleDept = (requestId: string, deptId: string) => {
    setSelectedDeptIds((prev) => {
      const current = new Set(prev[requestId] ?? []);
      if (current.has(deptId)) current.delete(deptId);
      else current.add(deptId);
      return { ...prev, [requestId]: [...current] };
    });
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

  const integrationJson = useMemo(() => {
    if (!approveResult) return '';
    const base = {
      method: approveResult.integration.method,
      url: `https://www.usmart-iot.com${approveResult.integration.url}`,
      headers: approveResult.integration.headers,
      examples: approveResult.integration.bodyWithDepartments.length
        ? approveResult.integration.bodyWithDepartments.map((x) => ({
            department: x.departmentName,
            body: x.body,
          }))
        : [{ body: approveResult.integration.body }],
    };
    return JSON.stringify(base, null, 2);
  }, [approveResult]);

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
        <div className="mb-6 p-5 rounded-xl border-2 border-emerald-300 bg-emerald-50 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold text-emerald-900">API key approved — copy now</p>
              <p className="text-sm text-emerald-800 mt-1">
                Shown once. Share the key and request body with the integrator.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApproveResult(null)}
              className="text-emerald-700 hover:text-emerald-900 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">API key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono bg-white border border-emerald-200 rounded-lg px-3 py-2 break-all select-all">
                {approveResult.apiKey}
              </code>
              <button
                type="button"
                onClick={() => copyText(approveResult.apiKey)}
                className="shrink-0 p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                title="Copy API key"
              >
                <ClipboardDocumentIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {approveResult.workspace && (
            <p className="text-sm text-emerald-900">
              <span className="font-medium">Workspace:</span> {approveResult.workspace.companyName}
            </p>
          )}

          {approveResult.selectedDepartments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2">
                Allowed departments
              </p>
              <ul className="flex flex-wrap gap-2">
                {approveResult.selectedDepartments.map((d) => (
                  <li
                    key={d.id}
                    className="text-sm px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-900"
                  >
                    {d.name}
                    <span className="text-emerald-600 font-mono text-xs ml-1">({d.id.slice(0, 8)}…)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                Integration request body
              </p>
              <button
                type="button"
                onClick={() => copyText(integrationJson)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                Copy JSON
              </button>
            </div>
            <pre className="text-xs font-mono bg-white border border-emerald-200 rounded-lg p-4 overflow-x-auto max-h-96 text-gray-800">
              {integrationJson}
            </pre>
            <p className="text-xs text-emerald-700 mt-2">
              Use <code className="bg-emerald-100 px-1 rounded">privateCompanyTargetDepartmentId</code> for each
              allowed department when creating tickets via API.
            </p>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Company and private-workspace accounts request API access from the mobile profile. For private workspace
        roles (Manager / Coordinator / Company owner), select which departments the key may target before approving.
      </p>

      {loading && list.length === 0 ? (
        <p className="text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500">No API key requests yet.</p>
      ) : (
        <div className="space-y-4">
          {list.map((r) => {
            const needsDepts =
              r.status === 'PENDING' &&
              r.workspace?.requiresDepartmentSelection &&
              (r.workspace.departments.length ?? 0) > 0;
            const picked = selectedDeptIds[r.id] ?? [];

            return (
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
                    {r.workspace && (
                      <p className="text-sm text-indigo-700 mt-1">
                        Private workspace: {r.workspace.companyName}
                        {PRIVATE_ROLES.has(r.requester.role.toUpperCase()) && (
                          <span className="text-indigo-500"> · department scope required</span>
                        )}
                      </p>
                    )}
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

                {r.allowedDepartments && r.allowedDepartments.length > 0 && (
                  <div className="mt-3 text-sm text-gray-700">
                    <span className="font-medium">Key departments:</span>{' '}
                    {r.allowedDepartments.map((d) => d.name).join(', ')}
                  </div>
                )}

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

                {needsDepts && (
                  <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                    <p className="text-sm font-medium text-indigo-900 mb-2">
                      Select departments for this API key
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {r.workspace!.departments.map((d) => {
                        const checked = picked.includes(d.id);
                        return (
                          <label
                            key={d.id}
                            className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border cursor-pointer ${
                              checked
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-indigo-900 border-indigo-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => toggleDept(r.id, d.id)}
                            />
                            {d.name}
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-xs text-indigo-600 hover:underline"
                      onClick={() =>
                        setSelectedDeptIds((prev) => ({
                          ...prev,
                          [r.id]: r.workspace!.departments.map((d) => d.id),
                        }))
                      }
                    >
                      Select all
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
                      onClick={() => handleApprove(r)}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Approve & generate key
                    </button>
                    <button
                      type="button"
                      disabled={actionId === r.id}
                      onClick={() => handleReject(r.id)}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                    >
                      <XMarkIcon className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
