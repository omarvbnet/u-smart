import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

function getSiteDelegate() {
  return (prisma as any).site;
}

async function resolveSiteDbId(params: Promise<unknown>): Promise<string | null> {
  const resolved = await params;
  if (!resolved || typeof resolved !== 'object') return null;
  const id = (resolved as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

/** POST: create visitor link with valid date range */
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
  const prismaAny = prisma as any;
  if (!siteDelegate?.findUnique || typeof prismaAny.siteVisitorLink?.create !== 'function') {
    return NextResponse.json({ success: false, message: 'Visitor links not available' }, { status: 503 });
  }

  let body: { validFrom?: string; validUntil?: string; includeTickets?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUntil =
    typeof body.validUntil === 'string' ? body.validUntil.trim() : typeof body.validUntil === 'number' ? String(body.validUntil) : '';
  if (!rawUntil) {
    return NextResponse.json({ success: false, message: 'validUntil (ISO date) is required' }, { status: 400 });
  }
  const validUntilDate = new Date(rawUntil);
  if (Number.isNaN(validUntilDate.getTime())) {
    return NextResponse.json({ success: false, message: 'invalid validUntil date' }, { status: 400 });
  }

  const rawFrom = typeof body.validFrom === 'string' ? body.validFrom.trim() : '';
  const validFromDate = rawFrom ? new Date(rawFrom) : new Date();
  if (rawFrom && Number.isNaN(validFromDate.getTime())) {
    return NextResponse.json({ success: false, message: 'invalid validFrom date' }, { status: 400 });
  }

  const nowMs = Date.now();
  const minEnd = Math.max(validFromDate.getTime() + 60_000, nowMs + 60_000);
  if (validUntilDate.getTime() < minEnd) {
    return NextResponse.json(
      {
        success: false,
        message:
          'validUntil must be after validFrom (and after now). Choose an end date at least ~1 minute in the future.',
      },
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
      return NextResponse.json({ success: false, message: 'Your role cannot create visitor links' }, { status: 403 });
    }
    if (me?.status === 'BLOCKED' || me?.status === 'SUSPENDED') {
      return NextResponse.json({ success: false, message: 'Account is not active' }, { status: 403 });
    }

    const site = await siteDelegate.findUnique({
      where: { id: siteDbId },
      select: { id: true, requesterId: true },
    });
    if (!site || site.requesterId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const token = randomBytes(24).toString('base64url');
    const includeTickets = body.includeTickets === true;

    await prismaAny.siteVisitorLink.create({
      data: {
        siteId: siteDbId,
        token,
        createdByRequesterId: auth.payload.requesterId,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        includeTickets,
      },
    });

    const rawBase = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || '';
    const baseUrl =
      typeof rawBase === 'string' && rawBase.startsWith('http')
        ? rawBase.replace(/\/$/, '')
        : rawBase
          ? `https://${String(rawBase).replace(/^\/*/, '').replace(/\/$/, '')}`
          : 'https://www.usmart-iot.com';

    return NextResponse.json({
      success: true,
      link: {
        token,
        validFrom: validFromDate.toISOString(),
        validUntil: validUntilDate.toISOString(),
        includeTickets,
        urls: {
          ar: `${baseUrl}/ar/site-visit/${encodeURIComponent(token)}`,
          en: `${baseUrl}/en/site-visit/${encodeURIComponent(token)}`,
          ku: `${baseUrl}/ku/site-visit/${encodeURIComponent(token)}`,
          tr: `${baseUrl}/tr/site-visit/${encodeURIComponent(token)}`,
        },
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2021' || String(err ?? '').includes('site_visitor_links')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database migration required for visitor links (npx prisma migrate deploy)',
        },
        { status: 503 }
      );
    }
    console.error('POST /api/sites/[id]/visitor-link:', err);
    return NextResponse.json({ success: false, message: 'Failed to create visitor link' }, { status: 500 });
  }
}

/** GET: list visitor links owned by creator for this site */
export async function GET(req: NextRequest, { params }: { params: Promise<unknown> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const siteDbId = await resolveSiteDbId(params);
  if (!siteDbId) {
    return NextResponse.json({ success: false, message: 'Missing site id' }, { status: 400 });
  }

  const prismaAny = prisma as any;
  if (!prismaAny.siteVisitorLink?.findMany) {
    return NextResponse.json({ success: true, links: [] });
  }

  try {
    const site = await getSiteDelegate().findUnique({
      where: { id: siteDbId },
      select: { requesterId: true },
    });
    if (!site || site.requesterId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const rows = await prismaAny.siteVisitorLink.findMany({
      where: { siteId: siteDbId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        validFrom: true,
        validUntil: true,
        includeTickets: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    const links = rows.map((r: { id: string; validFrom: Date; validUntil: Date; includeTickets: boolean; createdAt: Date }) => {
      const vu = new Date(r.validUntil).getTime();
      const vf = new Date(r.validFrom).getTime();
      return {
        id: r.id,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        includeTickets: r.includeTickets,
        createdAt: r.createdAt,
        expired: now > vu,
        notYetValid: now < vf,
      };
    });

    return NextResponse.json({ success: true, links });
  } catch (err: unknown) {
    console.error('GET /api/sites/[id]/visitor-link:', err);
    return NextResponse.json({ success: false, message: 'Failed to list visitor links' }, { status: 500 });
  }
}

/** DELETE: revoke a visitor link (owner only): ?linkId=cuid */
export async function DELETE(req: NextRequest, { params }: { params: Promise<unknown> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const siteDbId = await resolveSiteDbId(params);
  const linkId = req.nextUrl.searchParams.get('linkId')?.trim();
  if (!siteDbId || !linkId) {
    return NextResponse.json({ success: false, message: 'Missing site id or linkId' }, { status: 400 });
  }

  const prismaAny = prisma as any;
  if (!prismaAny.siteVisitorLink?.update) {
    return NextResponse.json({ success: false, message: 'Visitor links not available' }, { status: 503 });
  }

  try {
    const site = await getSiteDelegate().findUnique({
      where: { id: siteDbId },
      select: { requesterId: true },
    });
    if (!site || site.requesterId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
    }

    const row = await prismaAny.siteVisitorLink.findFirst({
      where: { id: linkId, siteId: siteDbId },
      select: { id: true, revokedAt: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Link not found' }, { status: 404 });
    }
    if (row.revokedAt) {
      return NextResponse.json({ success: true });
    }

    await prismaAny.siteVisitorLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sites/[id]/visitor-link:', err);
    return NextResponse.json({ success: false, message: 'Failed to revoke visitor link' }, { status: 500 });
  }
}

