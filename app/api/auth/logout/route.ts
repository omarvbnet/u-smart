import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { COOKIE_NAME, getAuthCookieOptions, verifyToken } from '@/lib/auth';
import { clearUserPushToken } from '@/lib/push-notifications';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  if (payload?.userId) {
    try {
      await clearUserPushToken(prisma as any, payload.userId);
    } catch (e) {
      console.error('Failed to clear user push token on logout:', e);
    }
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, '', { ...getAuthCookieOptions(), maxAge: 0 });
  return res;
}
