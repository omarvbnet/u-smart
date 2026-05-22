'use client';

import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { TicketsDashboard } from '@/components/proviser/TicketsDashboard';

export default function ProviserEngineerPage() {
  return (
    <ProviserPageGuard>
      {({ membership }) => (
        <TicketsDashboard membership={membership} title="My tickets" allowCreate={false} />
      )}
    </ProviserPageGuard>
  );
}
