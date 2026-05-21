'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import type { PrivateDepartment } from '@/components/proviser/use-proviser-workspace';

export default function ProviserDepartmentsPage() {
  return (
    <ProviserPageGuard>
      {({ membership, departments: initialDepts, refresh }) => (
        <DepartmentsContent
          membership={membership}
          initialDepartments={initialDepts}
          onRefresh={refresh}
        />
      )}
    </ProviserPageGuard>
  );
}

function DepartmentsContent({
  membership,
  initialDepartments,
  onRefresh,
}: {
  membership: { isOwner: boolean; departmentName: string | null; mode: string };
  initialDepartments: PrivateDepartment[];
  onRefresh: () => Promise<void>;
}) {
  const [departments, setDepartments] = useState<PrivateDepartment[]>(initialDepartments);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (membership.mode !== 'private') return;
    setLoading(true);
    try {
      const res = await fetch('/api/provisor-private-company/departments', { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.departments)) {
        setDepartments(data.departments);
      }
    } finally {
      setLoading(false);
    }
  }, [membership.mode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDepartments(initialDepartments);
  }, [initialDepartments]);

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
        await onRefresh();
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
    if (data.success) {
      await load();
      await onRefresh();
    } else {
      setMsg(data.message || 'Delete failed');
    }
  };

  if (membership.mode !== 'private') {
    return <p className="text-gray-400">Departments are managed in your private workspace. Apply for a workspace on mobile or contact support.</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Departments</h1>
      {!membership.isOwner && membership.departmentName && (
        <p className="text-sm text-gray-400 mb-4">Your department: {membership.departmentName}</p>
      )}

      {membership.isOwner && (
        <form onSubmit={createDept} className="flex gap-2 mb-6 max-w-md">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New department name"
            required
            className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-medium disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      )}
      {msg && <p className="text-sm text-amber-300 mb-4">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <ul className="space-y-2">
          {departments.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0f1419] px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: d.color || '#f59e0b' }}
                />
                <div>
                  <p className="font-medium">{d.name}</p>
                  {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
                  <p className="text-xs text-gray-600 mt-0.5">{d._count?.members ?? 0} members</p>
                </div>
              </div>
              {membership.isOwner && (
                <button
                  type="button"
                  onClick={() => deleteDept(d.id)}
                  className="text-red-400 hover:text-red-300 p-2"
                  aria-label="Delete department"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
