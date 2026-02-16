import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unreadOnly') === '1';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const list = await prisma.coordinatorNotification.findMany({
      where: { userId: payload.userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.coordinatorNotification.count({
      where: { userId: payload.userId, read: false },
    });

    return NextResponse.json({
      success: true,
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channel: n.channel,
        linkUrl: n.linkUrl,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/notifications:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
