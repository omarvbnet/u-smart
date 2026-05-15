import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import {
  loadPlatformTicketPolicy,
  normalizePolicyReasons,
  PLATFORM_SETTINGS_ID,
  serializePlatformTicketPolicy,
} from '@/lib/platform-ticket-policy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function adminUnauthorized() {
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
}

/**
 * GET /api/admin/ticket-policy
 * PATCH body: { cancellationReasons?: string[], resubmitReasons?: string[] }
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  const policy = await loadPlatformTicketPolicy();
  return NextResponse.json({ success: true, policy });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body?.cancellationReasons !== undefined) {
    data.ticketCancellationReasons = normalizePolicyReasons(body.cancellationReasons);
  }
  if (body?.resubmitReasons !== undefined) {
    data.ticketResubmitReasons = normalizePolicyReasons(body.resubmitReasons);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No changes provided.' }, { status: 400 });
  }

  const row = await prisma.provisorPlatformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      ticketCancellationReasons: (data.ticketCancellationReasons as string[]) ?? [],
      ticketResubmitReasons: (data.ticketResubmitReasons as string[]) ?? [],
    },
    update: data,
    select: { ticketCancellationReasons: true, ticketResubmitReasons: true },
  });

  return NextResponse.json({
    success: true,
    policy: serializePlatformTicketPolicy(row),
  });
}
