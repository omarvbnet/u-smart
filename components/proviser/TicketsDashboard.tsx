'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { TicketList, type TicketRow } from '@/components/proviser/TicketList';
import { PageHeader, TabBar, SearchInput, ScopeBanner, Card, CardBody } from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';
import { PROVISER_SERVICE_SLUG } from '@/lib/proviser-web';

type StatusTab = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CANCELLED', label: 'Canceled' },
];

function normalizeStatus(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '_');
}

function matchesTab(status: string, tab: StatusTab): boolean {
  const n = normalizeStatus(status);
  if (tab === 'ALL') return true;
  if (tab === 'PENDING') return n === 'PENDING' || n === 'OPEN' || n === 'ASSIGNED';
  if (tab === 'IN_PROGRESS') return n === 'IN_PROGRESS' || n === 'ON_SITE' || n === 'ACTIVE';
  if (tab === 'COMPLETED') return n === 'COMPLETED' || n === 'DONE' || n === 'CLOSED';
  if (tab === 'CANCELLED') return n === 'CANCELLED' || n === 'CANCELED';
  return true;
}

export function TicketsDashboard({
  membership,
  title,
  allowCreate = false,
}: {
  membership: ProviserMembership;
  title: string;
  allowCreate?: boolean;
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    siteName: '',
    province: '',
    technique: 'inspection',
    slaHours: 24,
  });

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ serviceSlug: PROVISER_SERVICE_SLUG });
      const res = await fetch(`/api/tickets?${q}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setTickets(
          data.tickets.map((t: TicketRow) => ({
            id: t.id,
            siteName: t.siteName,
            technique: t.technique,
            status: t.status,
            createdAt: t.createdAt,
          }))
        );
      } else {
        setTickets([]);
      }
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: tickets.length,
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const t of tickets) {
      if (matchesTab(t.status, 'PENDING')) c.PENDING++;
      if (matchesTab(t.status, 'IN_PROGRESS')) c.IN_PROGRESS++;
      if (matchesTab(t.status, 'COMPLETED')) c.COMPLETED++;
      if (matchesTab(t.status, 'CANCELLED')) c.CANCELLED++;
    }
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (!matchesTab(t.status, tab)) return false;
      if (!q) return true;
      return (
        (t.siteName ?? '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.technique.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );
    });
  }, [tickets, tab, search]);

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          siteName: form.siteName.trim(),
          province: form.province.trim(),
          technique: form.technique,
          slaHours: form.slaHours,
          serviceSlug: PROVISER_SERVICE_SLUG,
          taskCategory: 'QUALITY',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setForm({ siteName: '', province: '', technique: 'inspection', slaHours: 24 });
        setMsg('Ticket created.');
        loadTickets();
      } else {
        setMsg(data.message || 'Could not create ticket');
      }
    } catch {
      setMsg('Could not create ticket');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Filter by status, search by site or ticket ID."
        actions={
          allowCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black text-sm font-semibold shadow-lg shadow-amber-500/20"
            >
              <PlusCircle className="w-4 h-4" />
              New ticket
            </button>
          ) : undefined
        }
      />
      <ScopeBanner membership={membership} />
      {msg && <p className="text-sm text-amber-300 mb-4">{msg}</p>}

      {showCreate && allowCreate && (
        <Card className="mb-6">
          <CardBody>
            <form onSubmit={createTicket} className="space-y-3 max-w-lg">
              <input
                required
                placeholder="Site name"
                value={form.siteName}
                onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white text-sm"
              />
              <input
                required
                placeholder="Province"
                value={form.province}
                onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white text-sm"
              />
              <select
                value={form.technique}
                onChange={(e) => setForm((f) => ({ ...f, technique: e.target.value }))}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-white text-sm"
              >
                <option value="inspection">Inspection</option>
                <option value="supervision">Supervision</option>
                <option value="building">Building</option>
                <option value="hse">HSE</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-sm disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Submit'}
              </button>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="space-y-4 mb-6">
        <TabBar
          tabs={TABS.map((t) => ({ ...t, count: counts[t.id] }))}
          active={tab}
          onChange={setTab}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search site, ticket ID, technique…" />
      </div>

      <TicketList
        tickets={filtered}
        loading={loading}
        emptyMessage={tab === 'ALL' ? 'No tickets yet.' : `No ${tab.replace('_', ' ').toLowerCase()} tickets.`}
      />
    </>
  );
}
