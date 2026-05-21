'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export type TicketRow = {
  id: string;
  siteName: string | null;
  technique: string;
  status: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-300',
  ON_SITE: 'bg-blue-500/20 text-blue-300',
  IN_PROGRESS: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
};

export function TicketList({
  tickets,
  loading,
  emptyMessage,
}: {
  tickets: TicketRow[];
  loading: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!tickets.length) {
    return <p className="text-center text-gray-500 py-12">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link
            href={`/proviser/tickets/${t.id}`}
            className="block rounded-xl border border-white/10 bg-[#0f1419] px-4 py-3 hover:border-amber-500/40 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-white truncate">{t.siteName || 'No site name'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.technique} · {new Date(t.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">{t.id}</p>
              </div>
              <span
                className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                  STATUS_COLORS[t.status] ?? 'bg-white/10 text-gray-300'
                }`}
              >
                {t.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
