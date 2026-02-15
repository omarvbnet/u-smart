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
    const statusParam = searchParams.get('status')?.toUpperCase();
    const typeParam = searchParams.get('type')?.toUpperCase();
    const validStatuses = ['PENDING', 'CONTACTED', 'QUOTED', 'CLOSED'];
    const validTypes = ['KNX', 'Buspro', 'Zigbee'];

    const where: Record<string, unknown> = {};
    if (statusParam && validStatuses.includes(statusParam)) {
      where.status = statusParam;
    }
    if (typeParam && validTypes.includes(typeParam)) {
      where.productType = typeParam;
    }

    const requests = await prisma.productRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { title: true, slug: true } } },
    });

    const pendingCount = await prisma.productRequest.count({
      where: { status: 'PENDING' },
    });

    return NextResponse.json({ success: true, requests, pendingCount });
  } catch (error) {
    console.error('GET /api/admin/product-requests:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch product requests' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
