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
  if (!site || typeof site.findMany !== 'function') {
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

    // Get ticket counts per service for each site
    const sitesWithCounts = await Promise.all(
      sites.map(async (site) => {
        const [qualityControlCount, enterpriseCount] = await Promise.all([
          prisma.visitorRequest.count({
            where: {
              requesterId: payload.requesterId,
              siteName: site.siteId,
              serviceSlug: 'quality-control-supervision',
            },
          }),
          prisma.visitorRequest.count({
            where: {
              requesterId: payload.requesterId,
              siteName: site.siteId,
              serviceSlug: 'enterprise-networking',
            },
          }),
        ]);
        return {
          ...site,
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
