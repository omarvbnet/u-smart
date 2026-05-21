'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlusCircle } from 'lucide-react';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { TicketList, type TicketRow } from '@/components/proviser/TicketList';
import { useProviserUser } from '@/components/proviser/use-proviser-user';
import { useProviserWorkspace } from '@/components/proviser/use-proviser-workspace';
import { PROVISER_SERVICE_SLUG, isEngineerRole } from '@/lib/proviser-web';

export default function ProviserCompanyPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useProviserUser({ redirectToLogin: true });
  const { membership } = useProviserWorkspace(user);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    siteName: '',
    province: '',
    technique: 'inspection',
    slaHours: 24,
  });
  const [msg, setMsg] = useState<string | null>(null);

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
    if (!user) return;
    if (isEngineerRole(user.role)) {
      router.replace('/proviser/engineer');
      return;
    }
    loadTickets();
  }, [user, loadTickets, router]);

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

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} membership={membership} onLogout={logout}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-semibold">Company tickets</h1>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-sm font-medium"
        >
          <PlusCircle className="w-4 h-4" />
          New ticket
        </button>
      </div>

      {msg && <p className="text-sm text-amber-300 mb-3">{msg}</p>}

      {showCreate && (
        <form onSubmit={createTicket} className="mb-6 p-4 rounded-xl border border-white/10 bg-[#0f1419] space-y-3">
          <input
            required
            placeholder="Site name"
            value={form.siteName}
            onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <input
            required
            placeholder="Province"
            value={form.province}
            onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          />
          <select
            value={form.technique}
            onChange={(e) => setForm((f) => ({ ...f, technique: e.target.value }))}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm"
          >
            <option value="inspection">Inspection</option>
            <option value="supervision">Supervision</option>
            <option value="building">Building</option>
            <option value="hse">HSE</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="w-full py-2 rounded-lg bg-amber-500 text-black font-medium text-sm disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Submit'}
          </button>
        </form>
      )}

      <TicketList tickets={tickets} loading={loading} emptyMessage="No tickets yet." />
    </ProviserShell>
  );
}
