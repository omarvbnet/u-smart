import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { registerRequesterPushToken } from '@/lib/push-notifications';

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = typeof body.platform === 'string' ? body.platform.toLowerCase() : 'unknown';
    if (!token) {
      return NextResponse.json({ success: false, message: 'Push token is required' }, { status: 400 });
    }
    await registerRequesterPushToken(prisma as any, auth.payload.requesterId, token, (platform as any));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/requester-push-token:', err);
    return NextResponse.json({ success: false, message: 'Failed to register push token' }, { status: 500 });
  }
}
