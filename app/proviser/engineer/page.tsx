'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { TicketList, type TicketRow } from '@/components/proviser/TicketList';
import { useProviserUser } from '@/components/proviser/use-proviser-user';
import { useProviserWorkspace } from '@/components/proviser/use-proviser-workspace';
import { PROVISER_SERVICE_SLUG, isEngineerRole } from '@/lib/proviser-web';

type Tab = 'mine' | 'available';

export default function ProviserEngineerPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useProviserUser({ redirectToLogin: true });
  const { membership } = useProviserWorkspace(user);
  const [tab, setTab] = useState<Tab>('mine');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ serviceSlug: PROVISER_SERVICE_SLUG });
      const res = await fetch(`/api/tickets?${q}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        const rows = data.tickets.map((t: TicketRow) => ({
          id: t.id,
          siteName: t.siteName,
          technique: t.technique,
          status: t.status,
          createdAt: t.createdAt,
        }));
        setTickets(
          tab === 'available'
            ? rows.filter((t: TicketRow) => t.status === 'PENDING')
            : rows.filter((t: TicketRow) => t.status !== 'PENDING')
        );
      } else {
        setTickets([]);
      }
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!user) return;
    if (!isEngineerRole(user.role)) {
      router.replace('/proviser/company');
      return;
    }
    loadTickets();
  }, [user, loadTickets, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} membership={membership} onLogout={logout}>
      <h1 className="text-xl font-semibold mb-4">Engineer workspace</h1>
      <div className="flex gap-2 mb-4">
        {(['mine', 'available'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm capitalize ${
              tab === t ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-gray-400'
            }`}
          >
            {t === 'mine' ? 'My tickets' : 'Available pool'}
          </button>
        ))}
        <button
          type="button"
          onClick={loadTickets}
          className="ml-auto text-sm text-gray-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
      <TicketList
        tickets={tickets}
        loading={loading}
        emptyMessage={tab === 'mine' ? 'No assigned tickets.' : 'No tickets in the pool.'}
      />
    </ProviserShell>
  );
}
