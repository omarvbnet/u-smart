import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing company id' }, { status: 400 });
  }

  try {
    const companyDelegate = (prisma as any).company;
    if (!companyDelegate?.findUnique) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    const company = await companyDelegate.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
            company: true,
          },
        },
      },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const requesterId = company.requesterId;
    const [ticketCount, siteCount, tickets] = await Promise.all([
      prisma.visitorRequest.count({ where: { requesterId } }),
      (prisma as any).site?.count?.({ where: { requesterId } }) ?? 0,
      prisma.visitorRequest.findMany({
        where: { requesterId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          siteName: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      company: {
        ...company,
        ticketCount,
        siteCount,
        tickets,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/companies/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing company id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }

    const companyDelegate = (prisma as any).company;
    if (!companyDelegate?.findUnique || !companyDelegate?.update) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    const company = await companyDelegate.findUnique({
      where: { id },
      select: { requesterId: true },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    await companyDelegate.update({
      where: { id },
      data: { status },
    });

    // Sync requester status so login respects it
    const requesterStatus = status === 'ACTIVE' ? 'ACTIVE' : status === 'BLOCKED' ? 'BLOCKED' : 'SUSPENDED';
    try {
      await prisma.ticketRequester.update({
        where: { id: company.requesterId },
        data: { status: requesterStatus as any },
      });
    } catch {
      /* ignore if column missing */
    }

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('PATCH /api/admin/companies/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update company' }, { status: 500 });
  }
}
