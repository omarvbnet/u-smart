import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing requester id' }, { status: 400 });
  }

  const body = await req.json();
  const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
  if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
    return NextResponse.json({ success: false, message: 'Invalid status. Use ACTIVE, SUSPENDED, or BLOCKED' }, { status: 400 });
  }

  try {
    const updated = await prisma.ticketRequester.update({
      where: { id },
      data: { status: status as 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' },
    });
    return NextResponse.json({
      success: true,
      requester: {
        id: updated.id,
        status: (updated as { status?: string }).status ?? 'ACTIVE',
      },
    });
  } catch (err) {
    console.error('PATCH /api/admin/requesters/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update requester' }, { status: 500 });
  }
}
