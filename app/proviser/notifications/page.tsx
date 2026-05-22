'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { PageHeader, Card, CardBody, EmptyState } from '@/components/proviser/proviser-ui';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  ticketId?: string | null;
};

export default function ProviserNotificationsPage() {
  return (
    <ProviserPageGuard>
      {() => <NotificationsContent />}
    </ProviserPageGuard>
  );
}

function NotificationsContent() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notifications?for=requester', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.notifications)) {
          setItems(data.notifications);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Alerts" subtitle="Workspace and ticket notifications." />
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : !items.length ? (
        <EmptyState message="No notifications." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card className={!n.read ? 'border-amber-500/20' : ''}>
                <CardBody className="py-3">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium text-white">{n.title}</p>
                    {!n.read && (
                      <span className="text-[10px] uppercase text-amber-400">New</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{n.message}</p>
                  <p className="text-xs text-slate-600 mt-2">
                    {new Date(n.createdAt).toLocaleString()}
                    {n.ticketId && (
                      <>
                        {' · '}
                        <Link
                          href={`/proviser/tickets/${n.ticketId}`}
                          className="text-amber-400 hover:underline"
                        >
                          View ticket
                        </Link>
                      </>
                    )}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
