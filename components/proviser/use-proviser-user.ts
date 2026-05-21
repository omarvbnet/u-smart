'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProviserUser } from '@/lib/proviser-web';
import { canAccessProviserWeb, proviserHomePath } from '@/lib/proviser-web';

export function useProviserUser(options?: { redirectToLogin?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<ProviserUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/requester-me', { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.user) {
      setUser(data.user);
      return data.user as ProviserUser;
    }
    setUser(null);
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await refresh();
      if (!cancelled) {
        setLoading(false);
        if (options?.redirectToLogin && !u) {
          router.replace('/proviser/login');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, router, options?.redirectToLogin]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/requester-logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    router.replace('/proviser/login');
    router.refresh();
  }, [router]);

  return { user, loading, refresh, logout, canAccess: canAccessProviserWeb(user), homePath: proviserHomePath(user?.role) };
}
