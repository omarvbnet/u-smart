import { NextRequest, NextResponse } from 'next/server';
import {
  coordsFromQfieldProjects,
  getWorkspaceSiteGuard,
  normalizeQfieldProjectsInput,
  qfieldJsonValue,
  serializeWorkspaceSite,
  ticketCountsForSite,
} from '@/lib/private-company-sites';
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

/** GET — all workspace sites (every staff member). ?mapOnly=1 for QField map pins only. */
export async function GET(req: NextRequest) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  const mapOnly = req.nextUrl.searchParams.get('mapOnly') === '1';

  try {
    const rows = await prisma.privateCompanySite.findMany({
      where: {
        companyId: guard.companyId,
        ...(mapOnly
          ? {
              hasQfield: true,
              latitude: { not: null },
              longitude: { not: null },
              confirmationStatus: 'CONFIRMED',
            }
          : {}),
      },
      orderBy: { siteCode: 'asc' },
      include: siteInclude,
    });

    const sites = await Promise.all(
      (rows as Parameters<typeof serializeWorkspaceSite>[0][]).map(async (row) => {
        const counts = mapOnly ? undefined : await ticketCountsForSite(guard.companyId, row.siteCode);
        return serializeWorkspaceSite(row, {
          canManage: guard.canManageSites,
          ticketMeta: counts,
        });
      })
    );

    return NextResponse.json({ success: true, sites, canManageSites: guard.canManageSites });
  } catch (err) {
    console.error('GET /api/provisor-private-company/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to load sites.' }, { status: 500 });
  }
}

/** POST — create site (owner / manager / coordinator only). */
export async function POST(req: NextRequest) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;
  if (!guard.canManageSites) {
    return NextResponse.json(
      { success: false, message: 'Only the owner, managers, or coordinators can add sites.' },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const siteCode = typeof body.siteCode === 'string' ? body.siteCode.trim() : typeof body.siteId === 'string' ? body.siteId.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const province = typeof body.province === 'string' ? body.province.trim() : '';
  if (!siteCode || !location || !province) {
    return NextResponse.json(
      { success: false, message: 'Site code, location, and province are required.' },
      { status: 400 }
    );
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: guard.requesterId },
    select: { name: true, username: true },
  });
  const actorName = me?.name ?? me?.username ?? 'Staff';
  const qfieldRaw = body.qfieldProjects;
  const projects =
    qfieldRaw !== undefined && qfieldRaw !== null
      ? normalizeQfieldProjectsInput(qfieldRaw, { id: guard.requesterId, name: actorName })
      : [];
  const hasQfieldInput = body.hasQfield === true || projects.length > 0;
  const coords = hasQfieldInput && projects.length > 0 ? await coordsFromQfieldProjects(projects) : { latitude: null as number | null, longitude: null as number | null, hasQfield: false };

  try {
    const created = await prisma.privateCompanySite.create({
      data: {
        companyId: guard.companyId,
        siteCode,
        location,
        province,
        latitude: coords.latitude,
        longitude: coords.longitude,
        hasQfield: hasQfieldInput && projects.length > 0,
        qfieldProjects: projects.length > 0 ? qfieldJsonValue(projects) : null,
        designDocuments:
          body.designDocuments !== undefined
            ? (() => {
                const docs = normalizeSiteDesignDocumentsInput(body.designDocuments);
                return docs.length > 0 ? siteDesignDocumentsToJsonValue(docs) : null;
              })()
            : undefined,
        confirmationStatus: 'CONFIRMED',
        createdByRequesterId: guard.requesterId,
        confirmedByRequesterId: guard.requesterId,
        confirmedAt: new Date(),
      },
      include: siteInclude,
    });
    const counts = await ticketCountsForSite(guard.companyId, siteCode);
    return NextResponse.json({
      success: true,
      site: serializeWorkspaceSite(created, { canManage: true, ticketMeta: counts }),
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Site code already exists in this workspace.' }, { status: 400 });
    }
    console.error('POST /api/provisor-private-company/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to create site.' }, { status: 500 });
  }
}
