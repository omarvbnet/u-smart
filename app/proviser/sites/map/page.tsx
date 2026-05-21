'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ProviserPageGuard } from '@/components/proviser/ProviserPageGuard';
import type { MapSitePin } from '@/components/proviser/SitesMapClient';
import { canViewSitesMap } from '@/lib/proviser-permissions';

const SitesMapClient = dynamic(
  () => import('@/components/proviser/SitesMapClient').then((m) => m.SitesMapClient),
  { ssr: false, loading: () => <div className="h-[480px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div> }
);

function parseProjects(raw: unknown): MapSitePin['qfieldProjects'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object' && typeof (p as { id?: string }).id === 'string')
    .map((p) => {
      const row = p as { id: string; title?: string; fileName?: string };
      return { id: row.id, title: row.title ?? row.fileName ?? row.id, fileName: row.fileName };
    });
}

export default function ProviserSitesMapPage() {
  return (
    <ProviserPageGuard>
      {({ user, membership }) => <SitesMapContent userRole={user.role ?? ''} membership={membership} />}
    </ProviserPageGuard>
  );
}

function SitesMapContent({
  userRole,
  membership,
}: {
  userRole: string;
  membership: { mode: string };
}) {
  const [pins, setPins] = useState<MapSitePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canViewSitesMap(userRole, membership.mode as 'private' | 'coordinator' | 'none')) {
      setError('Map not available for your role.');
      setLoading(false);
      return;
    }

    (async () => {
      const out: MapSitePin[] = [];
      const canPreviewWorkspace = membership.mode === 'private' || membership.mode === 'coordinator';
      const canPreviewPersonal = ['COMPANY', 'PERSONAL'].includes(userRole.toUpperCase());

      try {
        const [personalRes, workspaceRes] = await Promise.all([
          fetch('/api/sites', { credentials: 'include' }),
          canPreviewWorkspace
            ? fetch('/api/provisor-private-company/sites', { credentials: 'include' })
            : Promise.resolve(null),
        ]);

        const pushSite = (
          row: {
            id: string;
            siteId?: string;
            siteCode?: string;
            location?: string;
            province?: string;
            latitude?: number | null;
            longitude?: number | null;
            hasQfield?: boolean;
            qfieldProjects?: unknown;
            canEdit?: boolean;
            sharedWithMe?: boolean;
            confirmationStatus?: string;
          },
          source: 'personal' | 'workspace',
          canPreview: boolean
        ) => {
          const projects = parseProjects(row.qfieldProjects);
          if (!projects.length && !row.hasQfield) return;
          const lat = row.latitude != null ? Number(row.latitude) : 33.3152;
          const lng = row.longitude != null ? Number(row.longitude) : 44.3661;
          out.push({
            id: row.id,
            source,
            siteId: row.siteCode ?? row.siteId ?? row.id,
            location: row.location ?? '',
            province: row.province ?? '',
            latitude: lat,
            longitude: lng,
            hasQfield: true,
            qfieldProjects: projects,
            canPreviewQfield: canPreview && projects.length > 0,
          });
        };

        const personal = await personalRes.json();
        if (personal.success && Array.isArray(personal.sites)) {
          for (const s of personal.sites) {
            pushSite(s, 'personal', canPreviewPersonal || !!s.canEdit || !!s.sharedWithMe);
          }
        }

        if (workspaceRes) {
          const workspace = await workspaceRes.json();
          if (workspace.success && Array.isArray(workspace.sites)) {
            for (const s of workspace.sites) {
              if (s.confirmationStatus && s.confirmationStatus !== 'CONFIRMED') continue;
              pushSite(s, 'workspace', true);
            }
          }
        }

        setPins(out);
      } catch {
        setError('Failed to load sites');
      } finally {
        setLoading(false);
      }
    })();
  }, [userRole, membership.mode]);

  return (
    <div>
      <Link href="/proviser/sites" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" />
        Sites list
      </Link>
      <h1 className="text-xl font-semibold mb-1">QField layers map</h1>
      <p className="text-sm text-gray-500 mb-4">All project files and vector layers load on the map automatically.</p>
      {error && <p className="text-red-400 mb-4">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : pins.filter((p) => p.qfieldProjects.length > 0).length === 0 ? (
        <p className="text-gray-500">No sites with QField project files yet. Upload .qgz / .gpkg on a site first.</p>
      ) : (
        <SitesMapClient sites={pins.filter((p) => p.qfieldProjects.length > 0 && p.canPreviewQfield)} />
      )}
    </div>
  );
}
