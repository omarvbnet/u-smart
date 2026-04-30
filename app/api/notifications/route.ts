import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

export async function GET(req: NextRequest) {
  try {
    const forParam = req.nextUrl.searchParams.get('for');
    if (forParam !== 'admin' && forParam !== 'requester') {
      return NextResponse.json({ success: false, message: 'Invalid for param' }, { status: 400 });
    }
    const hasNotification = 'notification' in prisma && typeof (prisma as { notification?: { findMany: unknown; count: unknown } }).notification?.findMany === 'function';
    if (!hasNotification) {
      return NextResponse.json({ success: true, notifications: [], unreadCount: 0 });
    }
    const notification = (prisma as { notification: { findMany: (args: unknown) => Promise<unknown[]>; count: (args: unknown) => Promise<number> } }).notification;
    if (forParam === 'admin') {
      const list = await notification.findMany({
        where: { forAdmin: true, type: { not: 'push_token' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const unreadCount = await notification.count({
        where: { forAdmin: true, read: false, type: { not: 'push_token' } },
      });
      return NextResponse.json({ success: true, notifications: list, unreadCount });
    }
    if (forParam === 'requester') {
      let payload: { requesterId: string } | null = null;
      const cookieToken = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
      if (cookieToken) {
        payload = verifyRequesterToken(cookieToken);
      }
      if (!payload) {
        const headerAuth = getRequesterFromRequest(req);
        if (headerAuth) payload = headerAuth.payload;
      }
      if (!payload) {
        return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
      }
      const list = await notification.findMany({
        where: { requesterId: payload.requesterId, forAdmin: false, type: { not: 'push_token' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const unreadCount = await notification.count({
        where: { requesterId: payload.requesterId, forAdmin: false, read: false, type: { not: 'push_token' } },
      });
      return NextResponse.json({ success: true, notifications: list, unreadCount });
    }
  } catch (error) {
    const err = error as Error;
    console.error('GET /api/notifications:', err?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to fetch' }, { status: 500 });
  }
}
