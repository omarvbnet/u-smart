'use client';

import { Loader2 } from 'lucide-react';
import { useProviserUser } from '@/components/proviser/use-proviser-user';
import { useProviserWorkspace } from '@/components/proviser/use-proviser-workspace';
import { ProviserShell } from '@/components/proviser/ProviserShell';

export function ProviserPageGuard({
  children,
  requireManagement,
  requirePerformance,
}: {
  children: (ctx: ReturnType<typeof useProviserWorkspace> & { user: NonNullable<ReturnType<typeof useProviserUser>['user']> }) => React.ReactNode;
  requireManagement?: boolean;
  requirePerformance?: boolean;
}) {
  const { user, loading: authLoading, logout } = useProviserUser({ redirectToLogin: true });
  const ws = useProviserWorkspace(user);

  if (authLoading || !user || ws.loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (requireManagement && !ws.membership.canManageStaff && !ws.membership.canManageDepartments) {
    return (
      <ProviserShell user={user} membership={ws.membership} onLogout={logout}>
        <p className="text-gray-400">You do not have permission to manage team settings.</p>
      </ProviserShell>
    );
  }

  if (requirePerformance && !ws.membership.canViewPerformance) {
    return (
      <ProviserShell user={user} membership={ws.membership} onLogout={logout}>
        <p className="text-gray-400">Performance reports are only available to owners and managers.</p>
      </ProviserShell>
    );
  }

  return (
    <ProviserShell user={user} membership={ws.membership} onLogout={logout}>
      {children({ ...ws, user })}
    </ProviserShell>
  );
}
