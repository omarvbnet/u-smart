import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status')?.toUpperCase();
    const pendingCount = await prisma.trainingRequest.count({ where: { status: 'PENDING' } });
    const where = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
      ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' }
      : {};

    const requests = await prisma.trainingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      requests,
      pendingCount,
    });
  } catch (error) {
    console.error('GET /api/admin/training-requests:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch training requests' },
      { status: 500 }
    );
  }
}
