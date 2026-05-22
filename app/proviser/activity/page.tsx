'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import {
  PageHeader,
  ScopeBanner,
  Card,
  CardBody,
  EmptyState,
  TabBar,
  SearchInput,
} from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';

type ActivityRow = {
  id: string;
  action: string;
  actionLabel: string;
  resourceType: string;
  resourceId: string | null;
  summary: string;
  departmentName: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; username: string; role: string };
};

type Tab = 'all' | 'staff' | 'departments' | 'warehouse' | 'tickets' | 'settings';

const TAB_RESOURCE: Record<Exclude<Tab, 'all'>, string | null> = {
  staff: 'staff',
  departments: 'department',
  warehouse: 'material',
  tickets: 'ticket',
  settings: 'workspace',
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function ProviserActivityPage() {
  return (
    <ProviserPageGuard requirePrivateWorkspace requireManagement>
      {({ membership }) => <ActivityContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function ActivityContent({ membership }: { membership: ProviserMembership }) {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      const resType = tab !== 'all' ? TAB_RESOURCE[tab] : null;
      if (resType) params.set('resourceType', resType);
      const res = await fetch(`/api/provisor-private-company/workspace-activity?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs as ActivityRow[]);
        if (typeof data.message === 'string' && data.message) setNotice(data.message);
      } else {
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((row) => {
      const hay = [
        row.summary,
        row.actionLabel,
        row.actor.name,
        row.actor.username,
        row.departmentName,
        row.resourceId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'staff', label: 'Staff' },
    { id: 'departments', label: 'Departments' },
    { id: 'warehouse', label: 'Materials' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="proviser-page-enter max-w-4xl mx-auto">
      <PageHeader
        title="Workspace activity"
        subtitle="Who changed staff, departments, materials, settings, and tickets — and when. Logged automatically from the mobile app and this dashboard."
      />
      <ScopeBanner membership={membership} />
      {notice && (
        <p className="text-sm text-amber-200/90 mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          {notice}
        </p>
      )}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search summary, user, action…" />
      </div>
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="No activity yet. Actions from the mobile app and this dashboard (staff, departments, materials, settings, tickets) appear here automatically." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <li key={row.id}>
              <Card>
                <CardBody className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{row.summary}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="text-amber-200/90">{row.actionLabel}</span>
                      {' · '}
                      {row.actor.name || row.actor.username}
                      <span className="text-slate-500"> ({row.actor.role})</span>
                      {row.departmentName && (
                        <>
                          {' · '}
                          <span>{row.departmentName}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <time className="text-xs text-slate-500 shrink-0 tabular-nums">
                    {formatWhen(row.createdAt)}
                  </time>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500 mt-6">
        Stock movements (assign, use on site) are listed under Materials → warehouse activity API.
        Ticket opens are throttled to once per user per ticket every 30 minutes.
      </p>
    </div>
  );
}
