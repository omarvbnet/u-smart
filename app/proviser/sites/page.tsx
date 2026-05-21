'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserShell } from '@/components/proviser/ProviserShell';
import { useProviserUser } from '@/components/proviser/use-proviser-user';

type SiteRow = {
  id: string;
  siteId: string;
  location: string;
  province: string;
  ticketCount?: number;
};

export default function ProviserSitesPage() {
  const { user, loading: authLoading, logout } = useProviserUser({ redirectToLogin: true });
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch('/api/sites', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.sites)) {
          setSites(data.sites);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <ProviserShell user={user} onLogout={logout}>
      <h1 className="text-xl font-semibold mb-4">Sites</h1>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : !sites.length ? (
        <p className="text-gray-500 text-center py-12">No sites. Create sites from the mobile app or company tools.</p>
      ) : (
        <ul className="space-y-2">
          {sites.map((s) => (
            <li key={s.id} className="rounded-xl border border-white/10 bg-[#0f1419] px-4 py-3">
              <p className="font-medium">{s.siteId}</p>
              <p className="text-sm text-gray-400">{s.location}</p>
              <p className="text-xs text-gray-600 mt-1">
                {s.province}
                {s.ticketCount != null ? ` · ${s.ticketCount} tickets` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ProviserShell>
  );
}
