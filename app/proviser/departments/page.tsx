'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { PageHeader, ScopeBanner, Card, CardBody, EmptyState } from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';

type DeptMember = {
  id: string;
  username: string;
  name: string | null;
  role: string;
  status: string;
};

type Department = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  maintenanceProximityJoinEnabled?: boolean;
  maintenanceProximityRadiusM?: number | null;
  siteArrivalAutoOnSiteEnabled?: boolean;
  engineerAvailabilityPoolEnabled?: boolean;
  technicianAvailabilityPoolEnabled?: boolean;
  maintenanceDispatchMode?: string | null;
  members?: DeptMember[];
  _count?: { members: number };
};

export default function ProviserDepartmentsPage() {
  return (
    <ProviserPageGuard>
      {({ membership }) => <DepartmentsContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function DepartmentsContent({ membership }: { membership: ProviserMembership }) {
  if (membership.mode !== 'private') {
    return (
      <p className="text-slate-400">
        Departments are managed in your private workspace. Apply on mobile or contact support.
      </p>
    );
  }

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/provisor-private-company/departments', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.departments)) {
        let list = data.departments as Department[];
        if (!membership.canViewCompanyWide && membership.scopeDepartmentId) {
          list = list.filter((d) => d.id === membership.scopeDepartmentId);
        }
        setDepartments(list);
        if (list.length === 1) setExpandedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [membership.canViewCompanyWide, membership.scopeDepartmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const createDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!membership.isOwner) return;
    setSubmitting(true);
    setMsg('');
    try {
      const res = await fetch('/api/provisor-private-company/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setName('');
        setMsg('Department created.');
        await load();
      } else {
        setMsg(data.message || 'Failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDept = async (id: string) => {
    if (!membership.isOwner || !confirm('Delete this department?')) return;
    const res = await fetch(`/api/provisor-private-company/departments?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) await load();
    else setMsg(data.message || 'Delete failed');
  };

  const patchSettings = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/provisor-private-company/departments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (data.success) {
      setMsg('Settings saved.');
      await load();
    } else {
      setMsg(data.message || 'Save failed');
    }
  };

  const canEditDept = (deptId: string) =>
    membership.isOwner || membership.scopeDepartmentId === deptId;

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Field settings, crew pools, on-site distance, and staff per department."
      />
      <ScopeBanner membership={membership} />

      {membership.isOwner && (
        <form onSubmit={createDept} className="flex flex-col sm:flex-row gap-2 mb-6 max-w-lg">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New department name"
            required
            className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      )}
      {msg && <p className="text-sm text-amber-300 mb-4">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : !departments.length ? (
        <EmptyState message="No departments yet." />
      ) : (
        <ul className="space-y-3">
          {departments.map((dept) => {
            const open = expandedId === dept.id;
            const editable = canEditDept(dept.id);
            return (
              <li key={dept.id}>
                <Card>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-4 text-left"
                    onClick={() => setExpandedId(open ? null : dept.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: dept.color || '#f59e0b' }}
                      />
                      <div>
                        <p className="font-semibold text-white">{dept.name}</p>
                        <p className="text-xs text-slate-500">
                          {dept.members?.length ?? dept._count?.members ?? 0} staff ·{' '}
                          {dept.maintenanceDispatchMode ?? 'standard'} dispatch
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {membership.isOwner && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDept(dept.id);
                          }}
                          className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>

                  {open && (
                    <CardBody className="border-t border-white/[0.06] pt-0 space-y-5">
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                          Notifications & on-site
                        </h3>
                        <div className="space-y-3 text-sm">
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-slate-300">Auto on-site when arriving at site</span>
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={dept.siteArrivalAutoOnSiteEnabled ?? true}
                              onChange={(e) =>
                                patchSettings(dept.id, {
                                  siteArrivalAutoOnSiteEnabled: e.target.checked,
                                })
                              }
                              className="rounded"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-slate-300">Crew join by GPS proximity</span>
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={dept.maintenanceProximityJoinEnabled ?? false}
                              onChange={(e) =>
                                patchSettings(dept.id, {
                                  maintenanceProximityJoinEnabled: e.target.checked,
                                })
                              }
                              className="rounded"
                            />
                          </label>
                          <label className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-slate-300 shrink-0">Proximity radius (meters)</span>
                            <input
                              type="number"
                              min={10}
                              max={5000}
                              disabled={!editable}
                              defaultValue={dept.maintenanceProximityRadiusM ?? 150}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v)) {
                                  patchSettings(dept.id, { maintenanceProximityRadiusM: v });
                                }
                              }}
                              className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white w-full sm:w-32"
                            />
                          </label>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                          Crew management
                        </h3>
                        <div className="space-y-3 text-sm">
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-slate-300">Engineer availability pool</span>
                            <input
                              type="checkbox"
                              disabled={!membership.isOwner}
                              checked={dept.engineerAvailabilityPoolEnabled ?? false}
                              onChange={(e) =>
                                patchSettings(dept.id, {
                                  engineerAvailabilityPoolEnabled: e.target.checked,
                                })
                              }
                              className="rounded"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-slate-300">Technician availability pool</span>
                            <input
                              type="checkbox"
                              disabled={!membership.isOwner}
                              checked={dept.technicianAvailabilityPoolEnabled ?? false}
                              onChange={(e) =>
                                patchSettings(dept.id, {
                                  technicianAvailabilityPoolEnabled: e.target.checked,
                                })
                              }
                              className="rounded"
                            />
                          </label>
                        </div>
                      </section>

                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                          Department staff
                        </h3>
                        {!dept.members?.length ? (
                          <p className="text-slate-500 text-sm">No members assigned.</p>
                        ) : (
                          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] overflow-hidden">
                            {dept.members.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-center justify-between px-3 py-2.5 bg-white/[0.02] text-sm"
                              >
                                <div>
                                  <p className="text-white font-medium">{m.name || m.username}</p>
                                  <p className="text-xs text-slate-500">{m.role}</p>
                                </div>
                                <span
                                  className={`text-[10px] uppercase px-2 py-0.5 rounded ${
                                    m.status === 'ACTIVE'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-500/15 text-slate-400'
                                  }`}
                                >
                                  {m.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </CardBody>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
