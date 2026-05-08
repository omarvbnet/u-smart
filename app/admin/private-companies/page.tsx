'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  BuildingOfficeIcon,
  PlusIcon,
  UserPlusIcon,
  ClipboardDocumentListIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

type PrivateCompany = {
  id: string;
  name: string;
  description: string | null;
  status: Status;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    username: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    province: string | null;
  } | null;
  _count: { departments: number; staff: number; checklists: number };
};

type EligibleUser = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  province: string | null;
};

type ChecklistItem = { id: string; label: string; weight?: string; required?: boolean };

type WorkspaceChecklist = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  techniqueTypes: string[];
  items: ChecklistItem[];
  createdById: string | null;
  departmentId: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string | null; username: string; role: string } | null;
};

const STATUS_BADGES: Record<Status, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border border-red-200',
  SUSPENDED: 'bg-slate-200 text-slate-700 border border-slate-300',
};

const TASK_CATEGORIES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'] as const;
const TECHNIQUE_OPTIONS = [
  'inspection',
  'supervision',
  'building',
  'hse',
  'investigation',
  'tracking',
  'maintenance',
  'fiber',
  'cabling',
  'wireless',
  'access',
  'cctv',
];

export default function AdminPrivateCompaniesPage() {
  const [list, setList] = useState<PrivateCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<Status | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [checklistsFor, setChecklistsFor] = useState<PrivateCompany | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/private-companies');
      const data = await res.json();
      if (data.success && Array.isArray(data.companies)) setList(data.companies as PrivateCompany[]);
      else setError(data.message ?? 'Failed to load private companies');
    } catch (e) {
      console.error(e);
      setError('Network error while loading private companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'suspend' | 'reactivate') => {
    setActionId(id);
    setError('');
    setOkMsg('');
    try {
      const payload: { action: typeof action; reason?: string } = { action };
      if (action === 'reject') {
        const reason = (rejectReason[id] || '').trim();
        if (!reason) {
          setError('Please provide a rejection reason.');
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
      const data = await res.json();
      if (data.success && data.company) {
        setList((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status: data.company.status,
                  approvedAt: data.company.approvedAt ?? c.approvedAt,
                  rejectionReason: data.company.rejectionReason ?? null,
                }
              : c
          )
        );
        setOkMsg(
          action === 'approve' || action === 'reactivate'
            ? 'Workspace approved. The owner can now build their company.'
            : action === 'reject'
              ? 'Workspace rejected.'
              : 'Workspace suspended.'
        );
      } else {
        setError(data.message ?? 'Failed to update workspace.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error while updating workspace.');
    } finally {
      setActionId(null);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return list;
    return list.filter((c) => c.status === statusFilter);
  }, [list, statusFilter]);

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const counts = useMemo(() => {
    const c: Record<Status | 'ALL', number> = {
      ALL: list.length,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      SUSPENDED: 0,
    };
    for (const r of list) c[r.status]++;
    return c;
  }, [list]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Private workspaces</h1>
          {counts.PENDING > 0 && (
            <span className="px-2.5 py-0.5 text-sm font-medium rounded-full bg-amber-100 text-amber-800">
              {counts.PENDING} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg text-white shadow-sm"
          >
            <PlusIcon className="w-5 h-5" />
            New private workspace
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s} <span className="ml-1 opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {okMsg && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-500 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          No workspaces found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 truncate">{c.name}</h2>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_BADGES[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Departments" value={c._count.departments} color="text-indigo-600" />
                <Stat label="Staff" value={c._count.staff} color="text-emerald-600" />
                <Stat label="Checklists" value={c._count.checklists} color="text-amber-600" />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <Field label="Owner" value={c.owner?.name ?? c.owner?.username ?? '—'} />
                  <Field label="Username" value={c.owner?.username ?? '—'} mono />
                  <Field label="Email" value={c.owner?.email ?? '—'} />
                  <Field label="Phone" value={c.owner?.phone ?? '—'} />
                  <Field label="Company" value={c.owner?.company ?? '—'} />
                  <Field label="Province" value={c.owner?.province ?? '—'} />
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-3">
                <span>Created: {formatDate(c.createdAt)}</span>
                {c.approvedAt && <span>Approved: {formatDate(c.approvedAt)}</span>}
              </div>

              {c.rejectionReason && (
                <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">
                  Reason: {c.rejectionReason}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {c.status === 'PENDING' && (
                  <>
                    <ActionButton
                      icon={<CheckIcon className="w-4 h-4" />}
                      label="Approve"
                      tone="emerald"
                      disabled={actionId === c.id}
                      onClick={() => handleAction(c.id, 'approve')}
                    />
                    <ActionButton
                      icon={<XMarkIcon className="w-4 h-4" />}
                      label="Reject"
                      tone="red"
                      disabled={actionId === c.id}
                      onClick={() => handleAction(c.id, 'reject')}
                    />
                    <input
                      type="text"
                      value={rejectReason[c.id] ?? ''}
                      onChange={(e) =>
                        setRejectReason((p) => ({ ...p, [c.id]: e.target.value }))
                      }
                      placeholder="Reject reason (required for reject)"
                      className="flex-1 min-w-[180px] px-2 py-1.5 text-xs rounded-lg border border-gray-300"
                    />
                  </>
                )}
                {c.status === 'APPROVED' && (
                  <>
                    <ActionButton
                      icon={<ClipboardDocumentListIcon className="w-4 h-4" />}
                      label="Manage checklists"
                      tone="indigo"
                      disabled={false}
                      onClick={() => setChecklistsFor(c)}
                    />
                    <ActionButton
                      icon={<PauseCircleIcon className="w-4 h-4" />}
                      label="Suspend"
                      tone="slate"
                      disabled={actionId === c.id}
                      onClick={() => handleAction(c.id, 'suspend')}
                    />
                  </>
                )}
                {(c.status === 'REJECTED' || c.status === 'SUSPENDED') && (
                  <ActionButton
                    icon={<PlayCircleIcon className="w-4 h-4" />}
                    label="Approve / reactivate"
                    tone="emerald"
                    disabled={actionId === c.id}
                    onClick={() => handleAction(c.id, 'reactivate')}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateWorkspaceModal
          onClose={() => setCreateOpen(false)}
          onCreated={(msg) => {
            setOkMsg(msg);
            setCreateOpen(false);
            void load();
          }}
        />
      )}
      {checklistsFor && (
        <WorkspaceChecklistsDrawer
          workspace={checklistsFor}
          onClose={() => setChecklistsFor(null)}
          onChange={() => void load()}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'emerald' | 'red' | 'slate' | 'indigo';
  disabled: boolean;
  onClick: () => void;
}) {
  const colors: Record<typeof tone, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
    red: 'bg-red-100 text-red-700 hover:bg-red-200',
    slate: 'bg-slate-200 text-slate-700 hover:bg-slate-300',
    indigo: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${colors[tone]} disabled:opacity-50`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Create / Promote modal ──────────────────────────────────────────────── */

function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'new_user' | 'promote'>('new_user');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);

  // shared workspace fields
  const [wsName, setWsName] = useState('');
  const [wsDescription, setWsDescription] = useState('');

  // new-user fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [province, setProvince] = useState('');
  const [serviceSlug, setServiceSlug] = useState<'enterprise-networking' | 'quality-control-supervision'>(
    'enterprise-networking'
  );

  // promote fields
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<EligibleUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EligibleUser | null>(null);

  useEffect(() => {
    if (mode !== 'promote') return;
    let cancelled = false;
    const run = async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/private-companies/eligible-users?q=${encodeURIComponent(searchQ)}`
        );
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.users)) {
          setSearchResults(data.users as EligibleUser[]);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, searchQ]);

  const submit = async () => {
    setErr('');
    if (!wsName.trim()) {
      setErr('Workspace name is required.');
      return;
    }
    setSubmitting(true);
    try {
      let body: Record<string, unknown>;
      if (mode === 'new_user') {
        if (!phone.trim()) {
          setErr('Phone is required for the new company user.');
          setSubmitting(false);
          return;
        }
        body = {
          mode: 'create_user_with_workspace',
          user: {
            name: name.trim() || undefined,
            phone: phone.trim(),
            email: email.trim() || undefined,
            company: company.trim() || undefined,
            province: province.trim() || undefined,
            serviceSlug,
          },
          workspace: { name: wsName.trim(), description: wsDescription.trim() || undefined },
        };
      } else {
        if (!selectedUser) {
          setErr('Pick a user to promote.');
          setSubmitting(false);
          return;
        }
        body = {
          mode: 'promote_existing',
          userId: selectedUser.id,
          workspace: { name: wsName.trim(), description: wsDescription.trim() || undefined },
        };
      }
      const res = await fetch('/api/admin/private-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        if (data.credentials) {
          setCredentials(data.credentials as { username: string; temporaryPassword: string });
        } else {
          onCreated(
            mode === 'new_user'
              ? 'Company user + workspace created and approved.'
              : 'User promoted to private workspace owner.'
          );
        }
      } else {
        setErr(data.message ?? 'Failed to create workspace.');
      }
    } catch (e) {
      console.error(e);
      setErr('Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlusIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Create private workspace</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {credentials ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-semibold text-emerald-800 mb-2">Workspace created</div>
              <p className="text-sm text-emerald-700 mb-3">
                Save these credentials – the temporary password is only shown once.
              </p>
              <div className="bg-white rounded-lg p-3 font-mono text-sm grid gap-1">
                <div>username: {credentials.username}</div>
                <div>password: {credentials.temporaryPassword}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCreated('Company user + workspace created and approved.')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={mode === 'new_user'}
                onClick={() => setMode('new_user')}
                title="New company user"
                subtitle="Create a brand-new TicketRequester (role COMPANY) and an approved workspace at once."
              />
              <ModeButton
                active={mode === 'promote'}
                onClick={() => setMode('promote')}
                title="Promote existing user"
                subtitle="Pick an existing COMPANY-role user and create their workspace, instantly approved."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Workspace name *"
                value={wsName}
                onChange={setWsName}
                placeholder="e.g. NovaTech Maintenance"
              />
              <Input
                label="Workspace description"
                value={wsDescription}
                onChange={setWsDescription}
                placeholder="Optional"
              />
            </div>

            {mode === 'new_user' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Owner name" value={name} onChange={setName} placeholder="e.g. Ali Hassan" />
                <Input label="Phone *" value={phone} onChange={setPhone} placeholder="07XXXXXXXXX" />
                <Input label="Email" value={email} onChange={setEmail} placeholder="optional" />
                <Input label="Company" value={company} onChange={setCompany} placeholder="optional" />
                <Input label="Province" value={province} onChange={setProvince} placeholder="optional" />
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                    Service slug
                  </label>
                  <select
                    value={serviceSlug}
                    onChange={(e) =>
                      setServiceSlug(
                        e.target.value as 'enterprise-networking' | 'quality-control-supervision'
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="enterprise-networking">enterprise-networking</option>
                    <option value="quality-control-supervision">quality-control-supervision</option>
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                  Search company users
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="name / username / phone / email"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="mt-3 max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {searching && <div className="p-3 text-xs text-gray-500">Searching…</div>}
                  {!searching && searchResults.length === 0 && (
                    <div className="p-3 text-xs text-gray-500">No eligible company users.</div>
                  )}
                  {!searching &&
                    searchResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className={`w-full text-left p-3 hover:bg-gray-50 ${
                          selectedUser?.id === u.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {u.name ?? u.username}
                          <span className="text-gray-400 font-normal ml-2 font-mono text-xs">
                            @{u.username}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {[u.email, u.phone, u.company, u.province].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    ))}
                </div>
                {selectedUser && (
                  <div className="mt-2 text-xs text-blue-700">
                    Selected: <span className="font-mono">@{selectedUser.username}</span>
                  </div>
                )}
              </div>
            )}

            {err && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
              >
                {submitting && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                {mode === 'new_user' ? 'Create user + workspace' : 'Promote and approve'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-colors ${
        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </div>
  );
}

/* ─── Per-workspace checklists drawer ────────────────────────────────────── */

function WorkspaceChecklistsDrawer({
  workspace,
  onClose,
  onChange,
}: {
  workspace: PrivateCompany;
  onClose: () => void;
  onChange: () => void;
}) {
  const [list, setList] = useState<WorkspaceChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/admin/private-companies/${workspace.id}/checklists`);
      const data = await res.json();
      if (data.success) setList(data.checklists as WorkspaceChecklist[]);
      else setErr(data.message ?? 'Failed to load checklists');
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  const remove = async (id: string) => {
    if (!confirm('Delete this checklist?')) return;
    try {
      const res = await fetch(
        `/api/admin/private-companies/${workspace.id}/checklists?checklistId=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        await load();
        onChange();
      } else {
        setErr(data.message ?? 'Failed to delete');
      }
    } catch {
      setErr('Network error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Workspace checklists</div>
            <h2 className="text-lg font-semibold text-gray-900">{workspace.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Admin-managed checklists. The workspace owner and any engineer/manager/coordinator can also create their own
              from the mobile app.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              New checklist
            </button>
          </div>

          {err && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{err}</div>
          )}

          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-gray-500 rounded-xl border border-dashed border-gray-200 bg-gray-50">
              No checklists yet for this workspace.
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                      {c.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                        {c.category && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold uppercase">
                            {c.category}
                          </span>
                        )}
                        {c.techniqueTypes.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {c.items.length} item{c.items.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(c.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                      aria-label="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {c.items.length > 0 && (
                    <ul className="mt-3 text-xs text-gray-700 space-y-1 list-disc list-inside">
                      {c.items.slice(0, 6).map((it) => (
                        <li key={it.id}>{it.label}</li>
                      ))}
                      {c.items.length > 6 && (
                        <li className="text-gray-400 list-none">
                          +{c.items.length - 6} more…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {showCreate && (
          <CreateChecklistModal
            workspaceId={workspace.id}
            onClose={() => setShowCreate(false)}
            onCreated={async () => {
              setShowCreate(false);
              await load();
              onChange();
            }}
          />
        )}
      </div>
    </div>
  );
}

function CreateChecklistModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'' | (typeof TASK_CATEGORIES)[number]>('');
  const [techniqueTypes, setTechniqueTypes] = useState<string[]>([]);
  const [items, setItems] = useState<{ label: string; required: boolean }[]>([{ label: '', required: false }]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const toggleTech = (t: string) => {
    setTechniqueTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async () => {
    setErr('');
    if (!name.trim()) return setErr('Name is required.');
    const cleaned = items.map((it) => ({ label: it.label.trim(), required: it.required })).filter((it) => it.label);
    if (cleaned.length === 0) return setErr('Add at least one item.');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/private-companies/${workspaceId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          techniqueTypes,
          items: cleaned,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await onCreated();
      } else {
        setErr(data.message ?? 'Failed to create checklist.');
      }
    } catch {
      setErr('Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">New checklist</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <Input label="Name *" value={name} onChange={setName} placeholder="e.g. Site safety inspection" />
          <Input label="Description" value={description} onChange={setDescription} placeholder="Optional" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as '' | (typeof TASK_CATEGORIES)[number])
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">— None —</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">
                Technique types
              </label>
              <div className="flex flex-wrap gap-1">
                {TECHNIQUE_OPTIONS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTech(t)}
                    className={`px-2 py-1 rounded-md text-xs font-medium border ${
                      techniqueTypes.includes(t)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Items
              </label>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { label: '', required: false }])}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={it.label}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p))
                      )
                    }
                    placeholder={`Item ${idx + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <label className="text-xs text-gray-600 inline-flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={it.required}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, required: e.target.checked } : p))
                        )
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    aria-label="Remove"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {err && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{err}</div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              {submitting && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              Save checklist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
