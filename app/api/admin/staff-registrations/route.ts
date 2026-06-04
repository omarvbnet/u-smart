import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const delegate = (
      prisma as { staffRegistrationRequest?: { findMany: (args: unknown) => Promise<unknown[]> } }
    ).staffRegistrationRequest;
    if (!delegate?.findMany) {
      return NextResponse.json({ success: true, requests: [] });
    }
    const requests = await delegate.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, requests });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Table not created yet on this environment — show an empty list instead of erroring.
    if (code === 'P2021' || code === 'P2010') {
      return NextResponse.json({ success: true, requests: [] });
    }
    console.error('GET /api/admin/staff-registrations:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch requests' }, { status: 500 });
  }
}
