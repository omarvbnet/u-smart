'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import {
  PageHeader,
  ScopeBanner,
  Card,
  CardBody,
  StatCard,
  SearchInput,
  EmptyState,
} from '@/components/proviser/proviser-ui';
import type { ProviserMembership } from '@/lib/proviser-permissions';

type ReasonRow = { reason: string; ticketCount: number };
type ProvinceBlock = { province: string; totalCancelled: number; byReason: ReasonRow[] };
type CaseRow = {
  ticketId: string;
  siteName: string | null;
  reason: string;
  province: string | null;
  departmentName: string | null;
  cancelledAt: string;
};

export default function ProviserCancellationsPage() {
  return (
    <ProviserPageGuard requirePrivateWorkspace>
      {({ membership }) => <CancellationsContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function CancellationsContent({ membership }: { membership: ProviserMembership }) {
  const [days, setDays] = useState(90);
  const [province, setProvince] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [byReason, setByReason] = useState<ReasonRow[]>([]);
  const [byProvince, setByProvince] = useState<ProvinceBlock[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days: String(days) });
    if (!membership.canViewCompanyWide && membership.scopeDepartmentId) {
      params.set('departmentId', membership.scopeDepartmentId);
    }
    if (province) params.set('province', province);

    fetch(`/api/provisor-private-company/cancellations/analytics?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setTotal(data.totalCancelled ?? 0);
          setByReason(data.byReason ?? []);
          setByProvince(data.byProvince ?? []);
          setCases(data.cases ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [days, province, membership]);

  const provinces = useMemo(() => {
    const set = new Set<string>();
    for (const p of byProvince) if (p.province) set.add(p.province);
    for (const c of cases) if (c.province) set.add(c.province);
    return [...set].sort();
  }, [byProvince, cases]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (!q) return true;
      return (
        (c.siteName ?? '').toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q) ||
        (c.province ?? '').toLowerCase().includes(q) ||
        c.ticketId.toLowerCase().includes(q)
      );
    });
  }, [cases, search]);

  return (
    <>
      <PageHeader
        title="Cancellations"
        subtitle="Canceled tickets by reason and province."
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
          </select>
        }
      />
      <ScopeBanner membership={membership} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <SearchInput value={search} onChange={setSearch} placeholder="Search cases…" />
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white sm:max-w-[200px]"
        >
          <option value="">All provinces</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label="Canceled tickets" value={total} />
            <StatCard label="Reasons" value={byReason.length} />
            <StatCard label="Provinces" value={byProvince.length} />
            <StatCard label="Cases shown" value={filteredCases.length} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-white mb-3">By reason</h2>
                <ul className="space-y-2 text-sm">
                  {byReason.map((r) => (
                    <li key={r.reason} className="flex justify-between gap-2">
                      <span className="text-slate-300">{r.reason}</span>
                      <span className="text-amber-300 font-medium tabular-nums">{r.ticketCount}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-white mb-3">By province</h2>
                <ul className="space-y-3 text-sm max-h-64 overflow-y-auto">
                  {byProvince.map((p) => (
                    <li key={p.province}>
                      <p className="font-medium text-white">
                        {p.province} <span className="text-slate-500">({p.totalCancelled})</span>
                      </p>
                      <ul className="mt-1 pl-3 text-slate-400 space-y-0.5">
                        {p.byReason.slice(0, 5).map((r) => (
                          <li key={r.reason}>
                            {r.reason}: {r.ticketCount}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <h2 className="text-sm font-semibold text-slate-400 mb-3">Recent cases</h2>
          {!filteredCases.length ? (
            <EmptyState message="No cancellation cases in this period." />
          ) : (
            <ul className="space-y-2">
              {filteredCases.slice(0, 80).map((c) => (
                <li key={`${c.ticketId}-${c.cancelledAt}`}>
                  <Card>
                    <CardBody className="py-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-medium text-white">{c.siteName || c.ticketId}</p>
                        <span className="text-xs text-rose-300">{c.reason}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {c.province ?? '—'} · {c.departmentName ?? '—'} ·{' '}
                        {new Date(c.cancelledAt).toLocaleDateString()}
                      </p>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
