import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

function getSiteDelegate() {
  return (prisma as any).site;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing site id' }, { status: 400 });
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate || typeof siteDelegate.findUnique !== 'function') {
    return NextResponse.json(
      { success: false, message: 'Sites not available. Run: npx prisma generate then restart the dev server.' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : undefined;
    const location = typeof body.location === 'string' ? body.location.trim() : undefined;
    const province = typeof body.province === 'string' ? body.province.trim() : undefined;
    const latitude = typeof body.latitude === 'number' ? body.latitude : undefined;
    const longitude = typeof body.longitude === 'number' ? body.longitude : undefined;

    const site = await siteDelegate.findUnique({
      where: { id },
      select: { requesterId: true, siteId: true },
    });

    if (!site || site.requesterId !== payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const data: { siteId?: string; location?: string; province?: string; latitude?: number | null; longitude?: number | null } = {};
    if (siteId !== undefined) data.siteId = siteId;
    if (location !== undefined) data.location = location;
    if (province !== undefined) data.province = province;
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No fields to update' },
        { status: 400 }
      );
    }

    // Check if new siteId conflicts
    if (siteId && siteId !== site.siteId) {
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
    }

    const updated = await siteDelegate.update({
      where: { id },
      data,
    });

    const ticketCount = await prisma.visitorRequest.count({
      where: {
        requesterId: payload.requesterId,
        siteName: updated.siteId,
      },
    });

    return NextResponse.json({
      success: true,
      site: {
        id: updated.id,
        siteId: updated.siteId,
        location: updated.location,
        province: updated.province,
        ticketCount,
      },
    });
  } catch (err) {
    console.error('PATCH /api/sites/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update site' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing site id' }, { status: 400 });
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate || typeof siteDelegate.findUnique !== 'function' || typeof siteDelegate.delete !== 'function') {
    return NextResponse.json(
      { success: false, message: 'Sites not available. Run: npx prisma generate then restart the dev server.' },
      { status: 503 }
    );
  }

  try {
    const site = await siteDelegate.findUnique({
      where: { id },
      select: { requesterId: true },
    });

    if (!site || site.requesterId !== payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    await siteDelegate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sites/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete site' }, { status: 500 });
  }
}
