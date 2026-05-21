'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import type { PrivateDepartment } from '@/components/proviser/use-proviser-workspace';
import type { ProviserMembership } from '@/lib/proviser-permissions';
import { COORDINATOR_DEPARTMENTS } from '@/lib/coordinator-access';

type StaffRow = {
  id: string;
  username: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
  status?: string;
  province?: string | null;
  privateCompanyDepartmentId?: string | null;
  departments?: string[];
};

const PRIVATE_STAFF_ROLES = ['ENGINEER', 'TECHNICIAN', 'WORKER', 'MANAGER', 'COORDINATOR'] as const;
const COORD_CREATE_ROLES = ['QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'ENGINEER', 'COORDINATOR', 'MANAGER', 'TEAM_LEADER', 'WORKER'] as const;

export default function ProviserStaffPage() {
  return (
    <ProviserPageGuard requireManagement>
      {({ membership, departments, user, refresh }) => (
        <StaffContent membership={membership} departments={departments} userId={user.id} onRefresh={refresh} />
      )}
    </ProviserPageGuard>
  );
}

function StaffContent({
  membership,
  departments,
  userId,
  onRefresh,
}: {
  membership: ProviserMembership;
  departments: PrivateDepartment[];
  userId: string;
  onRefresh: () => Promise<void>;
}) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'ENGINEER',
    departmentId: '',
    province: 'Baghdad',
    departments: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (membership.mode === 'private') {
        const res = await fetch('/api/provisor-private-company/staff', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          const rows = [...(data.staff ?? [])];
          if (data.owner && data.owner.id !== userId) {
            rows.unshift(data.owner);
          }
          setStaff(rows);
        }
      } else if (membership.mode === 'coordinator') {
        const res = await fetch('/api/company/staff', { credentials: 'include' });
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setStaff(
            data.users.map((u: StaffRow & { departments?: string[] }) => ({
              id: u.id,
              username: u.username,
              name: u.name,
              email: u.email,
              role: u.role,
              status: u.status,
              departments: u.departments,
            }))
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, [membership.mode, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const createStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setCredentials(null);
    try {
      if (membership.mode === 'private') {
        const res = await fetch('/api/provisor-private-company/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim() || undefined,
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            role: form.role,
            departmentId: form.departmentId || undefined,
            province: form.province,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setMsg('Staff created.');
          if (data.credentials) setCredentials(data.credentials);
          setShowForm(false);
          load();
          onRefresh();
        } else setMsg(data.message || 'Failed');
      } else {
        const res = await fetch('/api/company/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim() || undefined,
            email: form.email.trim(),
            role: form.role,
            departments: form.departments.length ? form.departments : undefined,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setMsg('Staff created.');
          if (data.credentials) setCredentials(data.credentials);
          setShowForm(false);
          load();
        } else setMsg(data.message || 'Failed');
      }
    } catch {
      setMsg('Request failed');
    }
  };

  const grantableRoles =
    membership.mode === 'private' && !membership.isOwner
      ? (['ENGINEER', 'TECHNICIAN', 'WORKER'] as const)
      : membership.mode === 'private'
        ? PRIVATE_STAFF_ROLES
        : COORD_CREATE_ROLES;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-semibold">Staff</h1>
        {membership.canManageStaff && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Add staff
          </button>
        )}
      </div>

      {membership.departmentName && !membership.isOwner && (
        <p className="text-sm text-gray-400 mb-4">Managing staff in: {membership.departmentName}</p>
      )}

      {msg && <p className="text-sm text-amber-300 mb-3">{msg}</p>}
      {credentials && (
        <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm">
          <p>
            Username: <strong>{credentials.username}</strong>
          </p>
          <p>
            Temporary password: <strong>{credentials.temporaryPassword}</strong>
          </p>
        </div>
      )}

      {showForm && membership.canManageStaff && (
        <form onSubmit={createStaff} className="mb-6 p-4 rounded-xl border border-white/10 bg-[#0f1419] grid sm:grid-cols-2 gap-3">
          <input
            required
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <input
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          />
          {membership.mode === 'private' && (
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            />
          )}
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          >
            {grantableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {membership.mode === 'private' ? (
            <>
              <select
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Province"
                value={form.province}
                onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
              />
            </>
          ) : (
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {COORDINATOR_DEPARTMENTS.map((d) => (
                <label key={d} className="inline-flex items-center gap-1 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.departments.includes(d)}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        departments: e.target.checked
                          ? [...f.departments, d]
                          : f.departments.filter((x) => x !== d),
                      }));
                    }}
                  />
                  {d.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          )}
          <button type="submit" className="sm:col-span-2 py-2 rounded-lg bg-amber-500 text-black font-medium text-sm">
            Create account
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Dept</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-3 pr-4">{s.name || '—'}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{s.username}</td>
                  <td className="py-3 pr-4">{s.role}</td>
                  <td className="py-3 pr-4 text-gray-400">
                    {membership.mode === 'private'
                      ? departments.find((d) => d.id === s.privateCompanyDepartmentId)?.name ?? '—'
                      : (s.departments ?? []).join(', ') || '—'}
                  </td>
                  <td className="py-3">{s.status ?? 'ACTIVE'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
