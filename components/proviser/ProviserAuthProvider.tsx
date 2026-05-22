'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ProviserUser } from '@/lib/proviser-web';
import { buildMembership, type ProviserMembership } from '@/lib/proviser-permissions';
import type { PrivateDepartment } from '@/components/proviser/use-proviser-workspace';

type AuthContextValue = {
  user: ProviserUser | null;
  membership: ProviserMembership;
  departments: PrivateDepartment[];
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function ProviserAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ProviserUser | null>(null);
  const [membership, setMembership] = useState<ProviserMembership>(buildMembership(null, null));
  const [departments, setDepartments] = useState<PrivateDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const meRes = await fetch('/api/auth/requester-me', { credentials: 'include' });
      const me = await meRes.json();
      if (!me.success || !me.user) {
        setUser(null);
        setMembership(buildMembership(null, null));
        setDepartments([]);
        return;
      }
      const u = me.user as ProviserUser;
      setUser(u);

      const wsRes = await fetch('/api/provisor-private-company', { credentials: 'include' });
      const wsData = await wsRes.json();
      if (wsData.success && wsData.workspace?.status === 'APPROVED') {
        setMembership(
          buildMembership(u, {
            membership: wsData.membership,
            workspace: wsData.workspace,
          })
        );
        setDepartments(
          Array.isArray(wsData.workspace.departments) ? wsData.workspace.departments : []
        );
      } else {
        setMembership(buildMembership(u, null, u.role));
        setDepartments([]);
      }
    } catch {
      setUser(null);
      setMembership(buildMembership(null, null));
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/requester-logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    router.replace('/proviser/login');
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, membership, departments, loading, logout, refresh }),
    [user, membership, departments, loading, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useProviserAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useProviserAuth must be used within ProviserAuthProvider');
  }
  return ctx;
}
