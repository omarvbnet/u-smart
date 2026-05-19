import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { QFieldMapBounds } from '@/lib/qfield-map-preview';
import {
  extractQfieldMapPreviewFromBytes,
  resolveTicketAssetAbsoluteUrl,
} from '@/lib/qfield-map-preview';
import {
  newQfieldEntityId,
  parseQFieldProjectsFromCompanyJson,
  qfieldProjectsToJsonValue,
  type QFieldProjectStored,
} from '@/lib/qfield-projects';
import { DEFAULT_MAINTENANCE_SLUGS } from '@/lib/provisor-technique-defaults';
import {
  CAN_MANAGE_SITES_ROLES,
  CAN_PROPOSE_SITE_CHANGES_ROLES,
  getPrivateCompanyMembership,
} from '@/lib/private-company-context';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type WorkspaceSiteGuard = {
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  role: string;
  canManageSites: boolean;
  canProposeChanges: boolean;
};

export async function getWorkspaceSiteGuard(req: NextRequest): Promise<
  | { ok: false; response: NextResponse }
  | { ok: true; guard: WorkspaceSiteGuard }
> {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }),
    };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 }),
    };
  }
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { status: true },
  });
  if (!company || company.status !== 'APPROVED') {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 }),
    };
  }
  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true, name: true, username: true },
  });
  const role = isOwner ? 'COMPANY' : String(me?.role ?? '').toUpperCase();
  const canManageSites = CAN_MANAGE_SITES_ROLES.has(role);
  const canProposeChanges = CAN_PROPOSE_SITE_CHANGES_ROLES.has(role);
  return {
    ok: true,
    guard: {
      requesterId: auth.payload.requesterId,
      companyId: m.effectiveCompanyId,
      isOwner,
      role,
      canManageSites,
      canProposeChanges,
    },
  };
}

export function centerFromBounds(b: QFieldMapBounds): { latitude: number; longitude: number } {
  return {
    latitude: (b.north + b.south) / 2,
    longitude: (b.east + b.west) / 2,
  };
}

export async function coordsFromQfieldProjects(
  projects: QFieldProjectStored[]
): Promise<{ latitude: number | null; longitude: number | null; hasQfield: boolean }> {
  if (!projects.length) {
    return { latitude: null, longitude: null, hasQfield: false };
  }
  const proj = projects[0];
  const ann = proj.mapAnnotation;
  if (ann && Number.isFinite(ann.latitude) && Number.isFinite(ann.longitude)) {
    return { latitude: ann.latitude, longitude: ann.longitude, hasQfield: true };
  }
  try {
    const absUrl = resolveTicketAssetAbsoluteUrl(proj.currentUrl);
    const res = await fetch(absUrl);
    if (!res.ok) {
      return { latitude: null, longitude: null, hasQfield: true };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const preview = await extractQfieldMapPreviewFromBytes(proj.fileName, buf);
    if (preview.bounds) {
      const c = centerFromBounds(preview.bounds);
      return { latitude: c.latitude, longitude: c.longitude, hasQfield: true };
    }
  } catch {
    /* preview best-effort */
  }
  return { latitude: null, longitude: null, hasQfield: true };
}

export function normalizeQfieldProjectsInput(raw: unknown, actor: { id: string; name: string }): QFieldProjectStored[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const now = new Date().toISOString();
  const out: QFieldProjectStored[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.currentUrl === 'string' ? o.currentUrl.trim() : typeof o.url === 'string' ? o.url.trim() : '';
    const fileName = typeof o.fileName === 'string' ? o.fileName.trim() : '';
    if (!url || !fileName) continue;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newQfieldEntityId();
    const title =
      (typeof o.title === 'string' && o.title.trim()) || fileName;
    out.push({
      id,
      title,
      description: typeof o.description === 'string' ? o.description : null,
      currentUrl: url,
      fileName,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : now,
      updatedAt: now,
      revisions: [],
      mapAnnotation: null,
      fieldEdits: null,
    });
  }
  return out;
}

export async function getMaintenanceSlugs(): Promise<string[]> {
  try {
    const rows = await prisma.provisorTechnique.findMany({
      where: { category: 'MAINTENANCE', active: true },
      select: { slug: true },
    });
    if (rows?.length) return rows.map((r: { slug: string }) => r.slug);
  } catch {
    /* pre-migration */
  }
  return [...DEFAULT_MAINTENANCE_SLUGS];
}

type SiteRow = {
  id: string;
  siteCode: string;
  location: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  hasQfield: boolean;
  qfieldProjects: unknown;
  confirmationStatus: string;
  pendingChange: unknown;
  createdByRequesterId: string;
  confirmedByRequesterId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { name: string | null; username: string | null } | null;
  confirmedBy?: { name: string | null; username: string | null } | null;
};

export function serializeWorkspaceSite(
  row: SiteRow,
  opts?: { ticketMeta?: Record<string, number>; canManage?: boolean }
) {
  const ticketMeta = opts?.ticketMeta;
  const projects = parseQFieldProjectsFromCompanyJson({
    qfieldProjects: row.qfieldProjects,
  });
  const mapReady = row.hasQfield && row.latitude != null && row.longitude != null;
  return {
    id: row.id,
    siteCode: row.siteCode,
    location: row.location,
    province: row.province,
    latitude: row.latitude,
    longitude: row.longitude,
    hasQfield: row.hasQfield,
    hasMapCoordinates: mapReady,
    qfieldProjects: projects,
    confirmationStatus: row.confirmationStatus,
    isConfirmed: row.confirmationStatus === 'CONFIRMED',
    pendingChange: row.pendingChange ?? null,
    createdByRequesterId: row.createdByRequesterId,
    createdByName: row.createdBy?.name ?? row.createdBy?.username ?? null,
    confirmedByRequesterId: row.confirmedByRequesterId,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmedByName: row.confirmedBy?.name ?? row.confirmedBy?.username ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canManage: opts?.canManage === true,
    ...(ticketMeta ?? {}),
  };
}

export async function ticketCountsForSite(companyId: string, siteCode: string) {
  const maintenanceSlugs = await getMaintenanceSlugs();
  const qcBase = {
    privateCompanyId: companyId,
    siteName: siteCode,
    serviceSlug: 'quality-control-supervision',
  };
  const [inspectionQcCount, maintenanceQcCount, supervisionTotal] = await Promise.all([
    prisma.visitorRequest.count({
      where: { ...qcBase, technique: { notIn: maintenanceSlugs } },
    }),
    prisma.visitorRequest.count({
      where: { ...qcBase, technique: { in: maintenanceSlugs } },
    }),
    prisma.visitorRequest.count({ where: qcBase }),
  ]);
  return {
    inspectionQcCount,
    maintenanceQcCount,
    supervisionTicketCount: supervisionTotal,
    ticketCount: supervisionTotal,
  };
}

export async function listTicketsForSite(
  companyId: string,
  siteCode: string,
  filter: 'all' | 'maintenance' | 'inspection'
) {
  const maintenanceSlugs = await getMaintenanceSlugs();
  const base = {
    privateCompanyId: companyId,
    siteName: siteCode,
    serviceSlug: 'quality-control-supervision',
  };
  const where =
    filter === 'maintenance'
      ? { ...base, technique: { in: maintenanceSlugs } }
      : filter === 'inspection'
        ? { ...base, technique: { notIn: maintenanceSlugs } }
        : base;
  const rows = await prisma.visitorRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      status: true,
      technique: true,
      province: true,
      createdAt: true,
      completedAt: true,
      company: true,
    },
  });
  return rows.map((t: Record<string, unknown>) => {
    let title = '';
    try {
      const c = typeof t.company === 'string' ? JSON.parse(t.company as string) : t.company;
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const ticket = (c as Record<string, unknown>)._ticket;
        if (ticket && typeof ticket === 'object' && !Array.isArray(ticket)) {
          title = String((ticket as Record<string, unknown>).title ?? '');
        }
      }
    } catch {
      /* ignore */
    }
    return {
      id: t.id,
      status: t.status,
      technique: t.technique,
      province: t.province,
      title,
      createdAt: (t.createdAt as Date).toISOString(),
      completedAt: t.completedAt ? (t.completedAt as Date).toISOString() : null,
      isMaintenance: maintenanceSlugs.includes(String(t.technique ?? '')),
    };
  });
}

export function qfieldJsonValue(projects: QFieldProjectStored[]) {
  return qfieldProjectsToJsonValue(projects);
}
