import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { id } = await params;

    const n = await prisma.coordinatorNotification.findFirst({
      where: { id, userId: payload.userId },
    });
    if (!n) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const read = body.read === true;

    await prisma.coordinatorNotification.update({
      where: { id },
      data: { read },
    });

    return NextResponse.json({ success: true, read });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/notifications/[id]:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
