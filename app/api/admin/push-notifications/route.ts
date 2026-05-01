import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { sendPushToAllRequesters, sendPushToRequesters } from '@/lib/push-notifications';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const requesterId = typeof body.requesterId === 'string' ? body.requesterId.trim() : '';
    if (!title || !message) {
      return NextResponse.json({ success: false, message: 'Title and message are required' }, { status: 400 });
    }
    let sent = 0;
    if (requesterId) {
      sent = await sendPushToRequesters(prisma as any, [requesterId], { title, body: message });
    } else {
      sent = await sendPushToAllRequesters(prisma as any, { title, body: message });
    }
    return NextResponse.json({ success: true, sent });
  } catch (err) {
    console.error('POST /api/admin/push-notifications:', err);
    return NextResponse.json({ success: false, message: 'Failed to send push notification' }, { status: 500 });
  }
}
