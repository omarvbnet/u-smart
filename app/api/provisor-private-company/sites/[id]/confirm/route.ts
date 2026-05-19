import { NextRequest, NextResponse } from 'next/server';
import {
  coordsFromQfieldProjects,
  getWorkspaceSiteGuard,
  qfieldJsonValue,
  serializeWorkspaceSite,
  ticketCountsForSite,
} from '@/lib/private-company-sites';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import {
  normalizeSiteDesignDocumentsInput,
  siteDesignDocumentsToJsonValue,
} from '@/lib/site-design-documents';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const siteInclude = {
  createdBy: { select: { name: true, username: true } },
  confirmedBy: { select: { name: true, username: true } },
};

/** POST — approve engineer pending site / QField changes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  if (!guard.canManageSites) {
    return NextResponse.json(
      { success: false, message: 'Only the owner, managers, or coordinators can confirm changes.' },
      { status: 403 }
    );
  }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch {
    body = {};
  }
  const reject = body.reject === true;

  const row = await prisma.privateCompanySite.findFirst({
    where: { id, companyId: guard.companyId },
    include: siteInclude,
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
  }

  if (reject) {
    const updated = await prisma.privateCompanySite.update({
      where: { id },
      data: {
        confirmationStatus: 'CONFIRMED',
        pendingChange: null,
        confirmedByRequesterId: guard.requesterId,
        confirmedAt: new Date(),
      },
      include: siteInclude,
    });
    const counts = await ticketCountsForSite(guard.companyId, updated.siteCode);
    return NextResponse.json({
      success: true,
      rejected: true,
      site: serializeWorkspaceSite(updated, { canManage: true, ticketMeta: counts }),
    });
  }

  const pending = row.pendingChange as Record<string, unknown> | null;
  if (!pending || row.confirmationStatus !== 'PENDING') {
    return NextResponse.json({ success: false, message: 'No pending changes to confirm.' }, { status: 400 });
  }

  const data: Record<string, unknown> = {
    confirmationStatus: 'CONFIRMED',
    pendingChange: null,
    confirmedByRequesterId: guard.requesterId,
    confirmedAt: new Date(),
  };
  if (typeof pending.siteCode === 'string' && pending.siteCode.trim()) {
    data.siteCode = pending.siteCode.trim();
  }
  if (typeof pending.location === 'string') data.location = pending.location.trim();
  if (typeof pending.province === 'string') data.province = pending.province.trim();

  if (pending.qfieldProjects !== undefined) {
    const projects = parseQFieldProjectsFromCompanyJson({ qfieldProjects: pending.qfieldProjects });
    if (projects.length > 0) {
      const coords = await coordsFromQfieldProjects(projects);
      data.qfieldProjects = qfieldJsonValue(projects);
      data.hasQfield = true;
      data.latitude = coords.latitude;
      data.longitude = coords.longitude;
    }
  }

  if (pending.designDocuments !== undefined) {
    const docs = normalizeSiteDesignDocumentsInput(pending.designDocuments);
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
      site: serializeWorkspaceSite(updated, { canManage: true, ticketMeta: counts }),
    });
  } catch (err) {
    console.error('POST /api/provisor-private-company/sites/[id]/confirm:', err);
    return NextResponse.json({ success: false, message: 'Failed to confirm changes.' }, { status: 500 });
  }
}
