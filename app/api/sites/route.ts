import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { parseQFieldProjectsFromCompanyJson } from '@/lib/qfield-projects';
import {
  coordsFromQfieldProjects,
  normalizeQfieldProjectsInput,
  qfieldJsonValue,
} from '@/lib/private-company-sites';
import {
  normalizeSiteDesignDocumentsInput,
  parseSiteDesignDocuments,
  siteDesignDocumentsToJsonValue,
} from '@/lib/site-design-documents';
import {
  getMaintenanceSlugs,
  inspectionTechniqueWhere,
  maintenanceTechniqueWhere,
  sumCompletedHours,
} from '@/lib/site-ticket-meta';

function getSiteDelegate() {
  return (prisma as any).site;
}

type SiteRow = {
  id: string;
  siteId: string;
  location: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  hasQfield?: boolean;
  qfieldProjects?: unknown;
  designDocuments?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function siteQfieldFields(row: SiteRow) {
  const projects = parseQFieldProjectsFromCompanyJson({ qfieldProjects: row.qfieldProjects });
  return {
    hasQfield: row.hasQfield === true,
    qfieldProjects: projects,
    designDocuments: parseSiteDesignDocuments(row.designDocuments),
  };
}

async function siteWithTicketCounts(
  siteRow: SiteRow,
  ticketOwnerRequesterId: string,
  maintenanceSlugs: string[]
) {
  const qcBase = {
    requesterId: ticketOwnerRequesterId,
    siteName: siteRow.siteId,
    serviceSlug: 'quality-control-supervision',
  };
  const [
    qualityControlCount,
    enterpriseCount,
    inspectionQcCount,
    maintenanceQcCount,
    inspectionHoursTotal,
    maintenanceHoursTotal,
  ] = await Promise.all([
    prisma.visitorRequest.count({ where: { ...qcBase } }),
    prisma.visitorRequest.count({
      where: {
        requesterId: ticketOwnerRequesterId,
        siteName: siteRow.siteId,
        serviceSlug: 'enterprise-networking',
      },
    }),
    prisma.visitorRequest.count({
      where: { ...qcBase, ...inspectionTechniqueWhere(maintenanceSlugs) },
    }),
    prisma.visitorRequest.count({
      where: { ...qcBase, ...maintenanceTechniqueWhere(maintenanceSlugs) },
    }),
    sumCompletedHours({ ...qcBase, ...inspectionTechniqueWhere(maintenanceSlugs) }),
    sumCompletedHours({ ...qcBase, ...maintenanceTechniqueWhere(maintenanceSlugs) }),
  ]);
  return {
    ...siteRow,
    ...siteQfieldFields(siteRow),
    ticketCount: qualityControlCount + enterpriseCount,
    qualityControlCount,
    enterpriseCount,
    inspectionQcCount,
    maintenanceQcCount,
    inspectionHoursTotal,
    maintenanceHoursTotal,
  };
}

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const site = getSiteDelegate();
  const doExport = req.nextUrl.searchParams.get('export') === '1';
  if (!site || typeof site.findMany !== 'function') {
    if (doExport) {
      const data = { success: true, sites: [] as { siteId: string; location: string; province: string }[], exportedAt: new Date().toISOString() };
      return new NextResponse(JSON.stringify(data, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="sites-export-${new Date().toISOString().slice(0, 10)}.json"` },
      });
    }
    return NextResponse.json({ success: true, sites: [] });
  }

  try {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: {
        role: true,
        privateCompanyId: true,
        privateCompanyOwned: { select: { id: true, status: true } },
      },
    });
    const myRole = me?.role ?? 'COMPANY';
    const canReceiveSharedSites = myRole === 'COMPANY' || myRole === 'PERSONAL';
    const workspaceCompanyId =
      me?.privateCompanyOwned?.status === 'APPROVED'
        ? me.privateCompanyOwned.id
        : me?.privateCompanyId ?? null;

    const sites = await site.findMany({
      where: { requesterId: payload.requesterId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        siteId: true,
        location: true,
        province: true,
        latitude: true,
        longitude: true,
        hasQfield: true,
        qfieldProjects: true,
        designDocuments: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (doExport) {
      const exportData = {
        success: true,
        sites: (sites as SiteRow[]).map((s) => ({
          siteId: s.siteId,
          location: s.location,
          province: s.province,
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
        })),
        exportedAt: new Date().toISOString(),
      };
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="sites-export-${new Date().toISOString().slice(0, 10)}.json"` },
      });
    }

    const maintenanceSlugs = await getMaintenanceSlugs(workspaceCompanyId);

    const ownedWithMeta = await Promise.all(
      (sites as SiteRow[]).map(async (siteRow) => {
        const row = await siteWithTicketCounts(siteRow, payload.requesterId, maintenanceSlugs);
        return {
          ...row,
          sharedWithMe: false,
          canEdit: true,
          ownerRequesterId: payload.requesterId,
        };
      })
    );

    let sharedWithMeta: typeof ownedWithMeta = [];
    if (canReceiveSharedSites) {
      try {
        const shares = await (prisma as any).siteShare.findMany({
          where: { sharedWithRequesterId: payload.requesterId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            includeTickets: true,
            site: {
              select: {
                id: true,
                siteId: true,
                location: true,
                province: true,
                latitude: true,
                longitude: true,
                hasQfield: true,
                qfieldProjects: true,
                designDocuments: true,
                createdAt: true,
                updatedAt: true,
                requesterId: true,
                requester: { select: { username: true, name: true } },
              },
            },
          },
        });
        sharedWithMeta = await Promise.all(
          shares.map(
            async (sh: {
              id: string;
              includeTickets?: boolean;
              site: SiteRow & { requesterId: string; requester: { username: string; name: string | null } };
            }) => {
              const siteRow: SiteRow = {
                id: sh.site.id,
                siteId: sh.site.siteId,
                location: sh.site.location,
                province: sh.site.province,
                latitude: sh.site.latitude ?? null,
                longitude: sh.site.longitude ?? null,
                hasQfield: sh.site.hasQfield === true,
                qfieldProjects: sh.site.qfieldProjects,
                designDocuments: sh.site.designDocuments,
                createdAt: sh.site.createdAt,
                updatedAt: sh.site.updatedAt,
              };
              const shareTickets = sh.includeTickets !== false;
              const row = shareTickets
                ? await siteWithTicketCounts(siteRow, sh.site.requesterId, maintenanceSlugs)
                : {
                    ...siteRow,
                    ticketCount: 0,
                    qualityControlCount: 0,
                    enterpriseCount: 0,
                    inspectionQcCount: 0,
                    maintenanceQcCount: 0,
                    inspectionHoursTotal: 0,
                    maintenanceHoursTotal: 0,
                  };
              const ownerLabel = sh.site.requester?.name?.trim() || sh.site.requester?.username || '';
              return {
                ...row,
                sharedWithMe: true,
                canEdit: false,
                shareId: sh.id,
                shareIncludesTickets: shareTickets,
                ownerRequesterId: sh.site.requesterId,
                ownerUsername: ownerLabel,
              };
            }
          )
        );
      } catch {
        sharedWithMeta = [];
      }
    }

    return NextResponse.json({ success: true, sites: [...ownedWithMeta, ...sharedWithMeta] });
  } catch (err) {
    console.error('GET /api/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch sites' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  try {
    const body = await req.json();

    // Bulk import: body.sites = [{ siteId or name, latitude, longitude }, ...]
    // Optional: location, province (defaults: "lat, lng" and "—").
    const sitesToImport = body.sites;
    if (Array.isArray(sitesToImport) && sitesToImport.length > 0) {
      const siteDelegate = getSiteDelegate();
      if (!siteDelegate?.findUnique || !siteDelegate?.create) {
        return NextResponse.json(
          { success: false, message: 'Sites not available. Run: npx prisma generate then restart the dev server.' },
          { status: 503 }
        );
      }
      const parseCoord = (v: unknown): number | null => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const t = v.trim().replace(',', '.');
          const n = Number(t);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      const created: { siteId: string; location: string; province: string }[] = [];
      const skipped: { siteId: string; reason: string }[] = [];
      for (const item of sitesToImport) {
        const rawId =
          (typeof item.siteId === 'string' && item.siteId.trim()) ||
          (typeof item.name === 'string' && item.name.trim()) ||
          '';
        const siteId = rawId;
        const lat = parseCoord(item.latitude ?? item.lat);
        const lng = parseCoord(item.longitude ?? item.lng ?? item.lon);
        if (!siteId) {
          skipped.push({ siteId: '(empty)', reason: 'Missing siteId or name' });
          continue;
        }
        if (lat == null || lng == null) {
          skipped.push({ siteId, reason: 'Missing or invalid latitude/longitude' });
          continue;
        }
        let location = typeof item.location === 'string' ? item.location.trim() : '';
        if (!location) location = `${lat}, ${lng}`;
        let province = typeof item.province === 'string' ? item.province.trim() : '';
        if (!province) province = '—';
        const existing = await siteDelegate.findUnique({
          where: {
            requesterId_siteId: { requesterId: payload.requesterId, siteId },
          },
        });
        if (existing) {
          skipped.push({ siteId, reason: 'Site ID already exists' });
          continue;
        }
        await siteDelegate.create({
          data: {
            siteId,
            location,
            province,
            latitude: lat,
            longitude: lng,
            requesterId: payload.requesterId,
          },
        });
        created.push({ siteId, location, province });
      }
      return NextResponse.json({
        success: true,
        created: created.length,
        skipped: skipped.length,
        createdSites: created,
        skippedItems: skipped,
      });
    }

    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    let latitude = typeof body.latitude === 'number' ? body.latitude : null;
    let longitude = typeof body.longitude === 'number' ? body.longitude : null;

    if (!siteId || !location || !province) {
      return NextResponse.json(
        { success: false, message: 'Site ID, location, and province are required' },
        { status: 400 }
      );
    }

    const siteDelegate = getSiteDelegate();
    if (!siteDelegate || typeof siteDelegate.findUnique !== 'function' || typeof siteDelegate.create !== 'function') {
      return NextResponse.json(
        { success: false, message: 'Sites not available. Run: npx prisma generate then restart the dev server.' },
        { status: 503 }
      );
    }

    const existing = await siteDelegate.findUnique({
      where: {
        requesterId_siteId: {
          requesterId: payload.requesterId,
          siteId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: 'Site ID already exists' },
        { status: 400 }
      );
    }

    const me = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { name: true, username: true },
    });
    const actorName = me?.name ?? me?.username ?? 'User';

    const createData: Record<string, unknown> = {
      siteId,
      location,
      province,
      latitude,
      longitude,
      requesterId: payload.requesterId,
    };

    if (body.qfieldProjects !== undefined) {
      const projects = normalizeQfieldProjectsInput(body.qfieldProjects, {
        id: payload.requesterId,
        name: actorName,
      });
      if (projects.length > 0) {
        const coords = await coordsFromQfieldProjects(projects);
        createData.qfieldProjects = qfieldJsonValue(projects);
        createData.hasQfield = true;
        createData.latitude = coords.latitude;
        createData.longitude = coords.longitude;
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }

    if (body.designDocuments !== undefined) {
      const docs = normalizeSiteDesignDocumentsInput(body.designDocuments);
      createData.designDocuments =
        docs.length > 0 ? siteDesignDocumentsToJsonValue(docs) : null;
    }

    const created = await siteDelegate.create({
      data: createData,
    });

    const projects = parseQFieldProjectsFromCompanyJson({ qfieldProjects: created.qfieldProjects });
    return NextResponse.json({
      success: true,
      site: {
        id: created.id,
        siteId: created.siteId,
        location: created.location,
        province: created.province,
        latitude: created.latitude ?? null,
        longitude: created.longitude ?? null,
        hasQfield: created.hasQfield === true,
        qfieldProjects: projects,
        designDocuments: parseSiteDesignDocuments(created.designDocuments),
        ticketCount: 0,
        qualityControlCount: 0,
        enterpriseCount: 0,
        inspectionQcCount: 0,
        maintenanceQcCount: 0,
        inspectionHoursTotal: 0,
        maintenanceHoursTotal: 0,
      },
    });
  } catch (err) {
    console.error('POST /api/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to create site' }, { status: 500 });
  }
}
