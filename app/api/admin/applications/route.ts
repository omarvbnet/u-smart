import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const careerId = searchParams.get('careerId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (careerId) where.careerId = careerId;
    if (status) where.status = status;

    const applications = await prisma.application.findMany({
      where,
      include: { career: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error('GET /api/admin/applications:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch applications' }, { status: 500 });
  }
}
