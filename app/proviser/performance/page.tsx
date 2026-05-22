'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import {
  PageHeader,
  ScopeBanner,
  Card,
  CardBody,
  StatCard,
  EmptyState,
} from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';

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
  crewJoins?: number;
};

type DeptRow = {
  departmentId: string | null;
  departmentName: string;
  ticketsAssigned: number;
  completedTickets: number;
  avgArrivalHours?: number | null;
};

export default function ProviserPerformancePage() {
  return (
    <ProviserPageGuard requirePerformance>
      {({ membership }) => <PerformanceContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function PerformanceContent({ membership }: { membership: ProviserMembership }) {
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('');
  const [byStaff, setByStaff] = useState<KpiStaffRow[]>([]);
  const [byDepartment, setByDepartment] = useState<DeptRow[]>([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        if (membership.mode === 'private') {
          const params = new URLSearchParams({ days: String(days) });
          if (!membership.canViewCompanyWide && membership.scopeDepartmentId) {
            params.set('departmentId', membership.scopeDepartmentId);
          }
          const res = await fetch(`/api/provisor-private-company/kpis?${params}`, {
            credentials: 'include',
          });
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
            setScope(membership.canViewCompanyWide ? 'workspace' : 'department');
            const staffPerf = data.dashboard.staffPerformance ?? [];
            setByStaff(
              staffPerf.map(
                (s: {
                  userId: string;
                  role: string;
                  assigned: number;
                  completed: number;
                }) => ({
                  staffId: s.userId,
                  name: s.userId,
                  role: s.role,
                  departmentName: null,
                  ticketsAssigned: s.assigned,
                  completedTickets: s.completed,
                  avgTicketAssignmentsPerDay: 0,
                  totalTaskHours: 0,
                  avgTaskHours: null,
                })
              )
            );
            const deptPerf = data.dashboard.departmentPerformance ?? {};
            setByDepartment(
              Object.entries(deptPerf).map(([name, v]) => {
                const row = v as { totalTasks?: number; inProgress?: number };
                return {
                  departmentId: null,
                  departmentName: name,
                  ticketsAssigned: row.totalTasks ?? 0,
                  completedTickets: (row.totalTasks ?? 0) - (row.inProgress ?? 0),
                };
              })
            );
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [membership, days]);

  const totalAssigned = byStaff.reduce((s, r) => s + r.ticketsAssigned, 0);
  const totalCompleted = byStaff.reduce((s, r) => s + r.completedTickets, 0);

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="KPIs by department and individual staff."
        actions={
          membership.mode === 'private' ? (
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
          ) : null
        }
      />
      <ScopeBanner membership={membership} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard label="Scope" value={scope || '—'} />
            <StatCard label="Staff tracked" value={byStaff.length} />
            <StatCard label="Tickets assigned" value={totalAssigned} />
            <StatCard label="Completed" value={totalCompleted} />
          </div>

          <h2 className="text-sm font-semibold text-slate-400 mb-3">By department</h2>
          {!byDepartment.length ? (
            <EmptyState message="No department aggregates for this period." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 mb-8">
              {byDepartment.map((d) => (
                <Card key={d.departmentId ?? d.departmentName}>
                  <CardBody>
                    <p className="font-semibold text-white">{d.departmentName}</p>
                    <p className="text-sm text-slate-400 mt-2">
                      Assigned: <span className="text-amber-300">{d.ticketsAssigned}</span>
                      {' · '}
                      Completed: <span className="text-emerald-300">{d.completedTickets}</span>
                    </p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          <h2 className="text-sm font-semibold text-slate-400 mb-3">By staff</h2>
          {!byStaff.length ? (
            <EmptyState message="No staff metrics for this period." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 font-medium">Staff</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Dept</th>
                    <th className="px-4 py-3 font-medium text-right">Assigned</th>
                    <th className="px-4 py-3 font-medium text-right">Done</th>
                    <th className="px-4 py-3 font-medium text-right">Task h</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((s) => (
                    <tr key={s.staffId} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-slate-400">{s.role}</td>
                      <td className="px-4 py-3 text-slate-500">{s.departmentName ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.ticketsAssigned}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                        {s.completedTickets}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {s.totalTaskHours?.toFixed?.(1) ?? s.totalTaskHours}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
