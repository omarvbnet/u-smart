'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProviserUser } from '@/lib/proviser-web';
import { buildMembership, type ProviserMembership } from '@/lib/proviser-permissions';

export type PrivateDepartment = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  _count?: { members: number };
};

export type WorkspacePayload = {
  membership: ProviserMembership;
  departments: PrivateDepartment[];
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useProviserWorkspace(user: ProviserUser | null): WorkspacePayload {
  const [membership, setMembership] = useState<ProviserMembership>(
    buildMembership(user, null)
  );
  const [departments, setDepartments] = useState<PrivateDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMembership(buildMembership(null, null));
      setDepartments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/provisor-private-company', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.workspace?.status === 'APPROVED') {
        setMembership(
          buildMembership(user, {
            membership: data.membership,
            workspace: data.workspace,
          })
        );
        setDepartments(Array.isArray(data.workspace.departments) ? data.workspace.departments : []);
      } else {
        setMembership(buildMembership(user, null, user.role));
        setDepartments([]);
      }
    } catch {
      setMembership(buildMembership(user, null, user.role));
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { membership, departments, loading, refresh };
}
