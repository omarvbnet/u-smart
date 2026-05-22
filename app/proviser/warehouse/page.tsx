'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import {
  PageHeader,
  ScopeBanner,
  TabBar,
  SearchInput,
  Card,
  CardBody,
  EmptyState,
} from '@/components/proviser/proviser-ui';

type MaterialRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  itemCount?: number;
  tracking?: string;
};

type ToolRow = {
  id: string;
  name: string;
  serialNumber?: string | null;
  status?: string;
  materialName?: string;
};

type Tab = 'materials' | 'tools';

export default function ProviserWarehousePage() {
  return (
    <ProviserPageGuard requirePrivateWorkspace requireManagement>
      {({ membership }) => <WarehouseContent membership={membership} />}
    </ProviserPageGuard>
  );
}

function WarehouseContent({ membership }: { membership: import('@/lib/proviser-permissions').ProviserMembership }) {
  const [tab, setTab] = useState<Tab>('materials');
  const [search, setSearch] = useState('');
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/provisor-private-company/warehouse/materials', { credentials: 'include' }).then(
        (r) => r.json()
      ),
      fetch('/api/provisor-private-company/warehouse/items?limit=200', {
        credentials: 'include',
      }).then((r) => r.json()),
    ])
      .then(([matData, itemsData]) => {
        if (matData.success) setMaterials(matData.materials ?? []);
        if (itemsData.success) {
          const items = itemsData.items ?? itemsData.tools ?? [];
          setTools(
            items.map((i: Record<string, unknown>) => ({
              id: String(i.id),
              name: String(i.name ?? i.serialNumber ?? 'Item'),
              serialNumber: i.serialNumber as string | null,
              status: String(i.status ?? ''),
              materialName: (i.material as { name?: string })?.name ?? null,
            }))
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.category ?? '').toLowerCase().includes(q) ||
        (m.unit ?? '').toLowerCase().includes(q)
      );
    });
  }, [materials, search]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((t) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.serialNumber ?? '').toLowerCase().includes(q) ||
        (t.materialName ?? '').toLowerCase().includes(q)
      );
    });
  }, [tools, search]);

  return (
    <>
      <PageHeader
        title="Materials & tools"
        subtitle="Warehouse catalog and serialized tools for field staff."
      />
      <ScopeBanner membership={membership} />

      <TabBar
        tabs={[
          { id: 'materials' as Tab, label: 'Materials', count: materials.length },
          { id: 'tools' as Tab, label: 'Tools', count: tools.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-4 mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={tab === 'materials' ? 'Search materials…' : 'Search tools…'}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : tab === 'materials' ? (
        !filteredMaterials.length ? (
          <EmptyState message="No materials in catalog." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMaterials.map((m) => (
              <li key={m.id}>
                <Card>
                  <CardBody>
                    <p className="font-semibold text-white">{m.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {m.category || 'General'} · {m.unit || 'unit'} · {m.itemCount ?? 0} items
                    </p>
                    {m.tracking && (
                      <span className="inline-block mt-2 text-[10px] uppercase px-2 py-0.5 rounded bg-white/5 text-slate-400">
                        {m.tracking}
                      </span>
                    )}
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : !filteredTools.length ? (
        <EmptyState message="No tools in inventory." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filteredTools.map((t) => (
            <li key={t.id}>
              <Card>
                <CardBody>
                  <p className="font-semibold text-white">{t.name}</p>
                  {t.materialName && (
                    <p className="text-sm text-slate-400">{t.materialName}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {t.serialNumber ? `SN: ${t.serialNumber}` : '—'}
                    {t.status ? ` · ${t.status}` : ''}
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
