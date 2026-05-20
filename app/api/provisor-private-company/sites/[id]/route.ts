import { NextRequest, NextResponse } from 'next/server';
import {
  canManageWorkspaceSiteRow,
  coordsFromQfieldProjects,
  getWorkspaceSiteGuard,
  listTicketsForSite,
  normalizeQfieldProjectsInput,
  qfieldJsonValue,
  serializeWorkspaceSite,
  ticketCountsForSite,
} from '@/lib/private-company-sites';
import {
  normalizeSiteDesignDocumentsInput,
  siteDesignDocumentsToJsonValue,
} from '@/lib/site-design-documents';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const siteInclude = {
  createdBy: { select: { name: true, username: true } },
  confirmedBy: { select: { name: true, username: true } },
};

async function loadSite(companyId: string, id: string) {
  return prisma.privateCompanySite.findFirst({
    where: { id, companyId },
    include: siteInclude,
  });
}

/** GET — site detail + related tickets (?filter=maintenance|inspection|all). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Site ID required.' }, { status: 400 });
  }

  const filterRaw = req.nextUrl.searchParams.get('filter') ?? 'all';
  const filter =
    filterRaw === 'maintenance' || filterRaw === 'inspection' ? filterRaw : ('all' as const);

  try {
    const row = await loadSite(guard.companyId, id);
    if (!row) {
      return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
    }
    const counts = await ticketCountsForSite(guard.companyId, row.siteCode);
    const tickets = await listTicketsForSite(guard.companyId, row.siteCode, filter);
    return NextResponse.json({
      success: true,
      site: serializeWorkspaceSite(row, {
        canManage: canManageWorkspaceSiteRow(guard, row),
        ticketMeta: counts,
      }),
      tickets,
      filter,
    });
  } catch (err) {
    console.error('GET /api/provisor-private-company/sites/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to load site.' }, { status: 500 });
  }
}

/** PATCH — lead direct edit, or engineer proposal (pending confirmation). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const row = await loadSite(guard.companyId, id);
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: guard.requesterId },
    select: { name: true, username: true },
  });
  const actorName = me?.name ?? me?.username ?? 'Staff';

  const canDirectEdit = canManageWorkspaceSiteRow(guard, row);

  if (!canDirectEdit) {
    if (!guard.canProposeChanges) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    const pending: Record<string, unknown> = {
      submittedAt: new Date().toISOString(),
      submittedByRequesterId: guard.requesterId,
      submittedByName: actorName,
    };
    if (typeof body.location === 'string') pending.location = body.location.trim();
    if (typeof body.province === 'string') pending.province = body.province.trim();
    if (typeof body.siteCode === 'string') pending.siteCode = body.siteCode.trim();
    if (body.qfieldProjects !== undefined) {
      pending.qfieldProjects = normalizeQfieldProjectsInput(body.qfieldProjects, {
        id: guard.requesterId,
        name: actorName,
      });
      pending.hasQfield = true;
    }
    if (body.designDocuments !== undefined) {
      pending.designDocuments = normalizeSiteDesignDocumentsInput(body.designDocuments);
    }
    if (Object.keys(pending).length <= 3) {
      return NextResponse.json({ success: false, message: 'No changes to submit.' }, { status: 400 });
    }
    const updated = await prisma.privateCompanySite.update({
      where: { id },
      data: {
        confirmationStatus: 'PENDING',
        pendingChange: pending,
      },
      include: siteInclude,
    });
    const counts = await ticketCountsForSite(guard.companyId, row.siteCode);
    return NextResponse.json({
      success: true,
      pendingApproval: true,
      site: serializeWorkspaceSite(updated, {
        canManage: canManageWorkspaceSiteRow(guard, updated),
        ticketMeta: counts,
      }),
    });
  }

  const data: Record<string, unknown> = {
    confirmationStatus: 'CONFIRMED',
    pendingChange: null,
    confirmedByRequesterId: guard.requesterId,
    confirmedAt: new Date(),
  };
  if (typeof body.siteCode === 'string' && body.siteCode.trim()) data.siteCode = body.siteCode.trim();
  if (typeof body.location === 'string') data.location = body.location.trim();
  if (typeof body.province === 'string') data.province = body.province.trim();

  const rawLat = body.latitude;
  const rawLng = body.longitude;
  if (typeof rawLat === 'number' && typeof rawLng === 'number' && Number.isFinite(rawLat) && Number.isFinite(rawLng)) {
    data.latitude = rawLat;
    data.longitude = rawLng;
  } else if (rawLat === null && rawLng === null) {
    data.latitude = null;
    data.longitude = null;
  }

  if (body.qfieldProjects !== undefined) {
    const projects = normalizeQfieldProjectsInput(body.qfieldProjects, {
      id: guard.requesterId,
      name: actorName,
    });
    if (projects.length > 0) {
      const coords = await coordsFromQfieldProjects(projects);
      data.qfieldProjects = qfieldJsonValue(projects);
      data.hasQfield = true;
      data.latitude = coords.latitude;
      data.longitude = coords.longitude;
    } else {
      data.qfieldProjects = null;
      data.hasQfield = false;
      data.latitude = null;
      data.longitude = null;
    }
  } else if (body.removeQfield === true) {
    data.qfieldProjects = null;
    data.hasQfield = false;
    data.latitude = null;
    data.longitude = null;
  }

  if (body.designDocuments !== undefined) {
    const docs = normalizeSiteDesignDocumentsInput(body.designDocuments);
    data.designDocuments =
      docs.length > 0 ? siteDesignDocumentsToJsonValue(docs) : null;
  }

  try {
    const updated = await prisma.privateCompanySite.update({
      where: { id },
      data,
      include: siteInclude,
    });
    const counts = await ticketCountsForSite(guard.companyId, updated.siteCode);
    return NextResponse.json({
      success: true,
      site: serializeWorkspaceSite(updated, {
        canManage: canManageWorkspaceSiteRow(guard, updated),
        ticketMeta: counts,
      }),
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Site code already exists.' }, { status: 400 });
    }
    console.error('PATCH /api/provisor-private-company/sites/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update site.' }, { status: 500 });
  }
}

/** DELETE — site leads or the member who created the site. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  const { id } = await params;
  const row = await loadSite(guard.companyId, id);
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
  }
  if (!canManageWorkspaceSiteRow(guard, row)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  await prisma.privateCompanySite.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
