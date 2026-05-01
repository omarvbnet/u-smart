import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { clearRequesterPushToken } from '@/lib/push-notifications';

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (auth?.payload?.requesterId) {
    try {
      await clearRequesterPushToken(prisma as any, auth.payload.requesterId);
    } catch (e) {
      console.error('Failed to clear requester push token on logout:', e);
    }
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(REQUESTER_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
  });
  return res;
}
