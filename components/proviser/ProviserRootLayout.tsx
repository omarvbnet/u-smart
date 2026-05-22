'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ProviserAuthProvider, useProviserAuth } from '@/components/proviser/ProviserAuthProvider';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { isProviserPublicPath } from '@/lib/proviser-nav';
import { canAccessProviserWeb } from '@/lib/proviser-web';

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, membership, loading, logout } = useProviserAuth();

  useEffect(() => {
    if (loading) return;
    if (!user || !canAccessProviserWeb(user)) {
      router.replace('/proviser/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#07080c] flex items-center justify-center">
        <Loader2 className="w-9 h-9 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} membership={membership} onLogout={logout}>
      <div className="proviser-page-enter">{children}</div>
    </ProviserShell>
  );
}

export function ProviserRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = isProviserPublicPath(pathname);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <ProviserAuthProvider>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </ProviserAuthProvider>
  );
}
