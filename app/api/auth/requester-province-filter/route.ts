import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const row = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { province: true, provinceFilterActive: true },
    });
    return NextResponse.json({
      success: true,
      province: row?.province ?? null,
      provinceFilterActive: row?.provinceFilterActive ?? true,
    });
  } catch {
    return NextResponse.json({ success: true, province: null, provinceFilterActive: true });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.provinceFilterActive === 'boolean') {
      data.provinceFilterActive = body.provinceFilterActive;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: 'Nothing to update' }, { status: 400 });
    }

    await prisma.ticketRequester.update({
      where: { id: auth.payload.requesterId },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/auth/requester-province-filter:', err);
    return NextResponse.json({ success: false, message: 'Failed to update' }, { status: 500 });
  }
}
