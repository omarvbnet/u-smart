import { NextRequest, NextResponse } from 'next/server';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { prisma } from '@/lib/prisma';

function getSiteDelegate() {
  return (prisma as any).site;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyRequesterToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

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
    const sites = await site.findMany({
      where: { requesterId: payload.requesterId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        siteId: true,
        location: true,
        province: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (doExport) {
      const exportData = {
        success: true,
        sites: (sites as { siteId: string; location: string; province: string }[]).map((s) => ({ siteId: s.siteId, location: s.location, province: s.province })),
        exportedAt: new Date().toISOString(),
      };
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="sites-export-${new Date().toISOString().slice(0, 10)}.json"` },
      });
    }

    // Get ticket counts per service for each site
    type SiteRow = { id: string; siteId: string; location: string; province: string; createdAt: Date; updatedAt: Date };
    const sitesWithCounts = await Promise.all(
      (sites as SiteRow[]).map(async (siteRow) => {
        const [qualityControlCount, enterpriseCount] = await Promise.all([
          prisma.visitorRequest.count({
            where: {
              requesterId: payload.requesterId,
              siteName: siteRow.siteId,
              serviceSlug: 'quality-control-supervision',
            },
          }),
          prisma.visitorRequest.count({
            where: {
              requesterId: payload.requesterId,
              siteName: siteRow.siteId,
              serviceSlug: 'enterprise-networking',
            },
          }),
        ]);
        return {
          ...siteRow,
          ticketCount: qualityControlCount + enterpriseCount,
          qualityControlCount,
          enterpriseCount,
        };
      })
    );

    return NextResponse.json({ success: true, sites: sitesWithCounts });
  } catch (err) {
    console.error('GET /api/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch sites' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyRequesterToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Bulk import: body.sites = [{ siteId, location, province }, ...]
    const sitesToImport = body.sites;
    if (Array.isArray(sitesToImport) && sitesToImport.length > 0) {
      const siteDelegate = getSiteDelegate();
      if (!siteDelegate?.findUnique || !siteDelegate?.create) {
        return NextResponse.json(
          { success: false, message: 'Sites not available. Run: npx prisma generate then restart the dev server.' },
          { status: 503 }
        );
      }
      const created: { siteId: string; location: string; province: string }[] = [];
      const skipped: { siteId: string; reason: string }[] = [];
      for (const item of sitesToImport) {
        const siteId = typeof item.siteId === 'string' ? item.siteId.trim() : '';
        const location = typeof item.location === 'string' ? item.location.trim() : '';
        const province = typeof item.province === 'string' ? item.province.trim() : '';
        if (!siteId || !location || !province) {
          skipped.push({ siteId: siteId || '(empty)', reason: 'Missing siteId, location or province' });
          continue;
        }
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
          data: { siteId, location, province, requesterId: payload.requesterId },
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

    const created = await siteDelegate.create({
      data: {
        siteId,
        location,
        province,
        requesterId: payload.requesterId,
      },
    });

    return NextResponse.json({
      success: true,
      site: {
        id: created.id,
        siteId: created.siteId,
        location: created.location,
        province: created.province,
        ticketCount: 0,
        qualityControlCount: 0,
        enterpriseCount: 0,
      },
    });
  } catch (err) {
    console.error('POST /api/sites:', err);
    return NextResponse.json({ success: false, message: 'Failed to create site' }, { status: 500 });
  }
}
