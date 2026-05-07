import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { stringifyNotificationPayload } from '@/lib/notification-i18n';
import { sendLocalizedPushToRequesters } from '@/lib/push-notifications';
import { sendSiteSharedEmail } from '@/lib/email';

function getSiteDelegate() {
  return (prisma as any).site;
}

function normalizeShareTarget(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Prisma P2022 — column missing until migration `20260507200000_site_share_include_tickets` is applied. */
function migrateMissingColumnResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message:
        'Database migration required: apply site_shares.includeTickets (run: npx prisma migrate deploy)',
    },
    { status: 503 }
  );
}

async function resolveSiteDbId(params: Promise<unknown>): Promise<string | null> {
  const resolved = await params;
  if (!resolved || typeof resolved !== 'object') return null;
  const id = (resolved as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<unknown> }
) {
  const auth = getRequesterFromRequest(_req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const siteDbId = await resolveSiteDbId(params);
  if (!siteDbId) {
    return NextResponse.json({ success: false, message: 'Missing site id' }, { status: 400 });
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate?.findUnique) {
    return NextResponse.json({ success: false, message: 'Sites not available' }, { status: 503 });
  }

  try {
    const site = await siteDelegate.findUnique({
      where: { id: siteDbId },
      select: { requesterId: true },
    });
    if (!site || site.requesterId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const rows = await (prisma as any).siteShare.findMany({
      where: { siteId: siteDbId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        includeTickets: true,
        sharedWith: { select: { id: true, username: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, shares: rows });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2022') {
      return migrateMissingColumnResponse();
    }
    console.error('GET /api/sites/[id]/share:', err);
    return NextResponse.json({ success: false, message: 'Failed to list shares' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<unknown> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const siteDbId = await resolveSiteDbId(params);
  if (!siteDbId) {
    return NextResponse.json({ success: false, message: 'Missing site id' }, { status: 400 });
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate?.findUnique || !(prisma as any).siteShare?.create) {
    return NextResponse.json({ success: false, message: 'Site sharing not available' }, { status: 503 });
  }

  let body: { usernameOrEmail?: string; includeTickets?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const usernameOrEmail = typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail : '';
  const includeTickets = body.includeTickets !== false;
  if (!usernameOrEmail.trim()) {
    return NextResponse.json(
      { success: false, message: 'usernameOrEmail is required' },
      { status: 400 }
    );
  }

  try {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, status: true },
    });
    const role = me?.role ?? 'COMPANY';
    const canShare =
      role === 'COMPANY' ||
      role === 'PERSONAL' ||
      role === 'ENGINEER' ||
      role === 'TECHNICIAN';
    if (!canShare) {
      return NextResponse.json(
        { success: false, message: 'Your role cannot share sites' },
        { status: 403 }
      );
    }
    if (me?.status === 'BLOCKED' || me?.status === 'SUSPENDED') {
      return NextResponse.json({ success: false, message: 'Account is not active' }, { status: 403 });
    }

    const site = await siteDelegate.findUnique({
      where: { id: siteDbId },
      select: { id: true, requesterId: true, siteId: true },
    });
    if (!site || site.requesterId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const key = normalizeShareTarget(usernameOrEmail);
    const recipient = await prisma.ticketRequester.findFirst({
      where: {
        OR: [
          { username: { equals: key, mode: 'insensitive' } },
          { email: { equals: key, mode: 'insensitive' } },
        ],
        status: 'ACTIVE',
      },
      select: { id: true, username: true, role: true, email: true, name: true },
    });

    if (!recipient) {
      return NextResponse.json(
        { success: false, message: 'No active user found with that username or email' },
        { status: 404 }
      );
    }

    if (recipient.id === auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'You cannot share a site with yourself' }, { status: 400 });
    }

    if (recipient.role === 'WORKER') {
      return NextResponse.json(
        { success: false, message: 'This account type cannot receive shared sites' },
        { status: 400 }
      );
    }

    await (prisma as any).siteShare.create({
      data: {
        siteId: siteDbId,
        sharedWithRequesterId: recipient.id,
        includeTickets,
      },
    });

    const sharer = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { username: true, name: true },
    });
    const fromName =
      (sharer?.name && String(sharer.name).trim()) ||
      (sharer?.username && String(sharer.username).trim()) ||
      'Someone';
    const siteLabel = String(site.siteId ?? '').trim() || siteDbId.slice(0, 8);

    const notifyPayload = {
      key: 'site_shared_received' as const,
      vars: {
        fromName,
        siteLabel,
        accessMode: includeTickets ? ('tickets' as const) : ('location_only' as const),
      },
    };

    try {
      await prisma.notification.create({
        data: {
          type: 'site_share',
          title: 'Site shared with you',
          message: `${fromName} shared site ${siteLabel}`,
          payload: stringifyNotificationPayload(notifyPayload),
          requesterId: recipient.id,
          forAdmin: false,
        },
      });
    } catch (e) {
      console.warn('notification create site_share:', e);
    }

    sendLocalizedPushToRequesters(prisma, [
      { requesterId: recipient.id, payload: notifyPayload, data: { type: 'site_share' } },
    ]).catch((e) => console.warn('FCM site_share:', e));

    const recEmail =
      recipient.email != null && typeof recipient.email === 'string' ? recipient.email.trim() : '';
    if (recEmail) {
      sendSiteSharedEmail({
        to: recEmail,
        fromDisplayName: fromName,
        siteLabel,
        includeTickets,
      }).catch((e) => console.warn('email site_share:', e));
    }

    return NextResponse.json({
      success: true,
      message: 'Site shared',
      sharedWith: { id: recipient.id, username: recipient.username },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'This user already has access to this site' },
        { status: 409 }
      );
    }
    if (code === 'P2022') {
      return migrateMissingColumnResponse();
    }
    console.error('POST /api/sites/[id]/share:', err);
    return NextResponse.json({ success: false, message: 'Failed to share site' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<unknown> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const siteDbId = await resolveSiteDbId(params);
  const shareId = req.nextUrl.searchParams.get('shareId')?.trim();
  if (!siteDbId || !shareId) {
    return NextResponse.json(
      { success: false, message: 'site id and shareId query parameter are required' },
      { status: 400 }
    );
  }

  if (!(prisma as any).siteShare?.delete) {
    return NextResponse.json({ success: false, message: 'Site sharing not available' }, { status: 503 });
  }

  try {
    const row = await (prisma as any).siteShare.findFirst({
      where: { id: shareId, siteId: siteDbId },
      select: {
        id: true,
        sharedWithRequesterId: true,
        site: { select: { requesterId: true } },
      },
    });

    if (!row) {
      return NextResponse.json({ success: false, message: 'Share not found' }, { status: 404 });
    }

    const isOwner = row.site.requesterId === auth.payload.requesterId;
    const isRecipient = row.sharedWithRequesterId === auth.payload.requesterId;
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ success: false, message: 'Not allowed' }, { status: 403 });
    }

    await (prisma as any).siteShare.delete({ where: { id: shareId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sites/[id]/share:', err);
    return NextResponse.json({ success: false, message: 'Failed to remove share' }, { status: 500 });
  }
}
