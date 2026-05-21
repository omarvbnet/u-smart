'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';

type KpiStaffRow = {
  staffId: string;
  name: string;
  role: string;
  departmentName: string | null;
  ticketsAssigned: number;
  completedTickets: number;
  avgTicketAssignmentsPerDay: number;
  totalTaskHours: number;
  avgTaskHours: number | null;
};

type DeptRow = {
  departmentId: string | null;
  departmentName: string;
  ticketsAssigned: number;
  completedTickets: number;
};

export default function ProviserPerformancePage() {
  return (
    <ProviserPageGuard requirePerformance>
      {({ membership }) => <PerformanceContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function PerformanceContent({
  membership,
}: {
  membership: {
    mode: string;
    isOwner: boolean;
    departmentName: string | null;
    performanceScope: string | null;
  };
}) {
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('');
  const [byStaff, setByStaff] = useState<KpiStaffRow[]>([]);
  const [byDepartment, setByDepartment] = useState<DeptRow[]>([]);
  const [coordStaff, setCoordStaff] = useState<
    Array<{ userId: string; role: string; assigned: number; completed: number }>
  >([]);
  const [coordDeptPerf, setCoordDeptPerf] = useState<
    Record<string, { totalTasks: number; inProgress?: number; withInSla?: number }>
  >({});

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        if (membership.mode === 'private') {
          const res = await fetch(`/api/provisor-private-company/kpis?days=${days}`, { credentials: 'include' });
          const data = await res.json();
          if (data.success) {
            setScope(data.scope ?? '');
            setByStaff(data.byStaff ?? []);
            setByDepartment(data.byDepartment ?? []);
          }
        } else if (membership.mode === 'coordinator') {
          const res = await fetch('/api/company/dashboard', { credentials: 'include' });
          const data = await res.json();
          if (data.success && data.dashboard) {
            setScope(membership.isOwner || membership.performanceScope === 'workspace' ? 'workspace' : 'department');
            setCoordStaff(data.dashboard.staffPerformance ?? []);
            setCoordDeptPerf(data.dashboard.departmentPerformance ?? {});
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [membership.mode, membership.isOwner, membership.performanceScope, days]);

  const title =
    scope === 'workspace'
      ? 'All staff performance'
      : scope === 'department'
        ? `Department: ${membership.departmentName ?? 'your departments'}`
        : 'Your performance';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-semibold">Performance</h1>
          <p className="text-sm text-gray-400 mt-1">{title}</p>
        </div>
        {membership.mode === 'private' && (
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : membership.mode === 'private' ? (
        <>
          {membership.isOwner && byDepartment.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-medium text-gray-400 mb-3">By department</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byDepartment.map((d) => (
                  <div key={d.departmentId ?? d.departmentName} className="rounded-xl border border-white/10 bg-[#0f1419] p-4">
                    <p className="font-medium">{d.departmentName}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Assigned: {d.ticketsAssigned} · Completed: {d.completedTickets}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Staff</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Dept</th>
                    <th className="py-2 pr-3">Assigned</th>
                    <th className="py-2 pr-3">Done</th>
                    <th className="py-2 pr-3">Task hrs</th>
                    <th className="py-2">Avg/day</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((s) => (
                    <tr key={s.staffId} className="border-b border-white/5">
                      <td className="py-2 pr-3">{s.name}</td>
                      <td className="py-2 pr-3">{s.role}</td>
                      <td className="py-2 pr-3 text-gray-400">{s.departmentName ?? '—'}</td>
                      <td className="py-2 pr-3">{s.ticketsAssigned}</td>
                      <td className="py-2 pr-3">{s.completedTickets}</td>
                      <td className="py-2 pr-3">{s.totalTaskHours}</td>
                      <td className="py-2">{s.avgTicketAssignmentsPerDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          {Object.keys(coordDeptPerf).length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-medium text-gray-400 mb-3">By department</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(coordDeptPerf).map(([dept, p]) => (
                  <div key={dept} className="rounded-xl border border-white/10 bg-[#0f1419] p-4">
                    <p className="font-medium">{dept.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Tasks: {p.totalTasks} · In progress: {p.inProgress ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Staff</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/10">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Assigned</th>
                  <th className="py-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {coordStaff.map((s) => (
                  <tr key={s.userId} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-mono text-xs">{s.userId.slice(0, 8)}…</td>
                    <td className="py-2 pr-3">{s.role}</td>
                    <td className="py-2 pr-3">{s.assigned}</td>
                    <td className="py-2">{s.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
