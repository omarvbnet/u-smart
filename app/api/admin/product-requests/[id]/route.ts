import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VALID_STATUSES = ['PENDING', 'CONTACTED', 'QUOTED', 'CLOSED'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: 'Invalid status. Must be one of: PENDING, CONTACTED, QUOTED, CLOSED' },
        { status: 400 }
      );
    }

    const request = await prisma.productRequest.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, request });
  } catch (error) {
    console.error('PATCH /api/admin/product-requests/[id]:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update request' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
