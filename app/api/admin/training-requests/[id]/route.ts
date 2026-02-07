import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : undefined;
    if (!status || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }

    const request = await prisma.trainingRequest.update({
      where: { id },
      data: { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    });

    return NextResponse.json({ success: true, request });
  } catch (error) {
    console.error('PATCH /api/admin/training-requests/[id]:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update training request' },
      { status: 500 }
    );
  }
}
