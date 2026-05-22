'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/proviser/proviser-ui';

export type TicketRow = {
  id: string;
  siteName: string | null;
  technique: string;
  status: string;
  createdAt: string;
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
            className="block rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141a22]/80 to-[#0f1419] px-4 py-3.5 hover:border-amber-500/35 transition shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-white truncate">{t.siteName || 'No site name'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.technique} · {new Date(t.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-mono">{t.id}</p>
              </div>
              <StatusBadge status={t.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
