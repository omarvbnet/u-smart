'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { useProviserUser } from '@/components/proviser/use-proviser-user';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  ticketId?: string | null;
};

export default function ProviserNotificationsPage() {
  const { user, loading: authLoading, logout } = useProviserUser({ redirectToLogin: true });
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch('/api/notifications?for=requester', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.notifications)) {
          setItems(data.notifications);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} onLogout={logout}>
      <h1 className="text-xl font-semibold mb-4">Notifications</h1>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : !items.length ? (
        <p className="text-gray-500 text-center py-12">No notifications.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border px-4 py-3 ${
                n.read ? 'border-white/5 bg-[#0f1419]/50' : 'border-amber-500/30 bg-[#0f1419]'
              }`}
            >
              <p className="font-medium text-white">{n.title}</p>
              <p className="text-sm text-gray-400 mt-1">{n.message}</p>
              <p className="text-xs text-gray-600 mt-2">{new Date(n.createdAt).toLocaleString()}</p>
              <div className="flex gap-3 mt-2">
                {n.ticketId && (
                  <Link href={`/proviser/tickets/${n.ticketId}`} className="text-sm text-amber-400 hover:underline">
                    View ticket
                  </Link>
                )}
                {!n.read && (
                  <button type="button" onClick={() => markRead(n.id)} className="text-sm text-gray-400 hover:text-white">
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProviserShell>
  );
}
