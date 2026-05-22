'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { TicketsDashboard } from '@/components/proviser/TicketsDashboard';
import { isEngineerRole } from '@/lib/proviser-web';
import type { ProviserPageContext } from '@/components/proviser/ProviserPageGuard';

function CompanyTickets({ user, membership }: ProviserPageContext) {
  const router = useRouter();

  useEffect(() => {
    if (isEngineerRole(user.role)) router.replace('/proviser/engineer');
  }, [user.role, router]);

  if (isEngineerRole(user.role)) return null;

  return (
    <TicketsDashboard membership={membership} title="Tickets" allowCreate />
  );
}

export default function ProviserCompanyPage() {
  return (
    <ProviserPageGuard>
      {(ctx) => <CompanyTickets {...ctx} />}
    </ProviserPageGuard>
  );
}
