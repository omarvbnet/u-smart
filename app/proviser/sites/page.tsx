'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Map } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import { PageHeader, SearchInput, ScopeBanner, Card, CardBody, EmptyState } from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';

type SiteRow = {
  id: string;
  siteId: string;
  location: string;
  province: string;
  ticketCount?: number;
  hasQfield?: boolean;
};

function SitesContent({ membership }: { membership: ProviserMembership }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');

  useEffect(() => {
    const url =
      membership.mode === 'private'
        ? '/api/provisor-private-company/sites'
        : '/api/sites';
    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setSites([]);
          return;
        }
        const list = data.sites ?? [];
        setSites(
          list.map((s: Record<string, unknown>) => ({
            id: String(s.id),
            siteId: String(s.siteId ?? s.site_id ?? ''),
            location: String(s.location ?? ''),
            province: String(s.province ?? ''),
            ticketCount: typeof s.ticketCount === 'number' ? s.ticketCount : undefined,
            hasQfield: Boolean(
              s.hasQfield ??
                (Array.isArray(s.qfieldProjects) && s.qfieldProjects.length > 0)
            ),
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [membership.mode]);

  const provinces = useMemo(() => {
    const set = new Set(sites.map((s) => s.province).filter(Boolean));
    return [...set].sort();
  }, [sites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (provinceFilter && s.province !== provinceFilter) return false;
      if (!q) return true;
      return (
        s.siteId.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q)
      );
    });
  }, [sites, search, provinceFilter]);

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle="Search sites by name, location, or province."
        actions={
          <Link
            href="/proviser/sites/map"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 text-amber-300 text-sm font-medium hover:bg-amber-500/10"
          >
            <Map className="w-4 h-4" />
            Open map
          </Link>
        }
      />
      <ScopeBanner membership={membership} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sites…" />
        {provinces.length > 0 && (
          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white sm:max-w-[200px]"
          >
            <option value="">All provinces</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : !filtered.length ? (
        <EmptyState message="No sites match your search." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <Card className="h-full hover:border-amber-500/25 transition">
                <CardBody>
                  <p className="font-semibold text-white">{s.siteId}</p>
                  <p className="text-sm text-slate-400 mt-1">{s.location || '—'}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {s.province}
                    {s.ticketCount != null ? ` · ${s.ticketCount} tickets` : ''}
                    {s.hasQfield ? ' · QField' : ''}
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

export default function ProviserSitesPage() {
  return (
    <ProviserPageGuard>
      {({ membership }) => <SitesContent membership={membership} />}
    </ProviserPageGuard>
  );
}
