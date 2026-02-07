import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const read = body.read === true;
    await prisma.notification.update({
      where: { id },
      data: { read },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('PATCH /api/notifications/[id]:', err?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to update' }, { status: 500 });
  }
}
