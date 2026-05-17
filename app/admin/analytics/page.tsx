'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, ChartBarIcon } from '@heroicons/react/24/outline';

type Row = { key: string; count: number };
type Trend = { date: string; count: number };

type Analytics = {
  summary: {
    totalRequesters: number;
    activeUsers: number;
    suspendedUsers: number;
    blockedUsers: number;
    totalProvisorTickets: number;
    pendingProvisorTickets: number;
    pendingRegistrationRequests: number;
    approvedRegistrationRequests: number;
    pendingCompanyRequests: number;
    pendingPrivateWorkspaces: number;
    workspaceStaff: { withWorkspace: number; withoutWorkspace: number };
  };
  usersByRole: Row[];
  usersByStatus: Row[];
  usersByProvince: Row[];
  registrationTrend: Trend[];
  provisorTicketsByStatus: Row[];
  provisorTicketsByProvince: Row[];
  provisorTicketsByCategory: Row[];
  provisorTicketsByRequesterRole: Row[];
  provisorTicketTrend: Trend[];
  roleHandlingNotes: { engineers: string; technicians: string };
};

function StatCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: string }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    slate: 'bg-white border-gray-200 text-gray-900',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function TableBlock({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-800">{r.key}</td>
                <td className="px-4 py-2 text-right font-medium">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendChart({ title, data }: { title: string; data: Trend[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="flex items-end gap-0.5 h-32">
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 bg-indigo-500/80 rounded-t min-w-[2px]"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-2">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      const json = await res.json();
      if (json.success) setData(json as Analytics);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-8 h-8 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Provisor analytics</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
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
      </div>

      {loading && !data ? (
        <p className="text-gray-500 py-12 text-center">Loading analytics…</p>
      ) : !s ? (
        <p className="text-gray-500 py-12 text-center">No data</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
            <StatCard label="Provisor users" value={s.totalRequesters} />
            <StatCard label="Active" value={s.activeUsers} tone="emerald" />
            <StatCard label="Suspended" value={s.suspendedUsers} tone="amber" />
            <StatCard label="Blocked" value={s.blockedUsers} tone="red" />
            <StatCard label="Pending tickets" value={s.pendingProvisorTickets} tone="amber" />
            <StatCard label="Total QC tickets" value={s.totalProvisorTickets} tone="indigo" />
            <StatCard label="Reg. requests pending" value={s.pendingRegistrationRequests} tone="amber" />
            <StatCard label="Company req. pending" value={s.pendingCompanyRequests} tone="amber" />
            <StatCard label="Workspace pending" value={s.pendingPrivateWorkspaces} tone="amber" />
            <StatCard label="In workspace" value={s.workspaceStaff.withWorkspace} tone="indigo" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {data.registrationTrend && <TrendChart title="User registrations by day" data={data.registrationTrend} />}
            {data.provisorTicketTrend && (
              <TrendChart title="Provisor tickets created by day" data={data.provisorTicketTrend} />
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <TableBlock title="Users by role" rows={data.usersByRole} />
            <TableBlock title="Users by status" rows={data.usersByStatus} />
            <TableBlock title="Users by province" rows={data.usersByProvince.slice(0, 20)} />
            <TableBlock title="Tickets by status" rows={data.provisorTicketsByStatus} />
            <TableBlock title="Tickets by category" rows={data.provisorTicketsByCategory} />
            <TableBlock title="Tickets by requester role" rows={data.provisorTicketsByRequesterRole} />
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4 text-sm text-blue-900 space-y-2">
            <p className="font-semibold">Field role routing (Provisor app)</p>
            <p>{data.roleHandlingNotes.engineers}</p>
            <p>{data.roleHandlingNotes.technicians}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin/provisor-requests" className="text-indigo-600 hover:underline font-medium">
              Open Provisor requests inbox →
            </Link>
            <Link href="/admin/requesters" className="text-indigo-600 hover:underline font-medium">
              Manage user roles & status →
            </Link>
            <Link href="/admin/registration-requests" className="text-indigo-600 hover:underline font-medium">
              Registration requests →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
