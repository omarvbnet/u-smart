import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Anonymous read-only site summary for visitor share links (valid date range).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const trimmed = decodeURIComponent(typeof token === 'string' ? token.trim() : '');
  if (!trimmed || trimmed.length > 512) {
    return NextResponse.json({ success: false, message: 'Invalid link' }, { status: 400 });
  }

  const prismaAny = prisma as any;
  if (!prismaAny.siteVisitorLink?.findFirst) {
    return NextResponse.json({ success: false, message: 'Not available' }, { status: 503 });
  }

  try {
    const now = new Date();
    const link = await prismaAny.siteVisitorLink.findFirst({
      where: {
        token: trimmed,
        revokedAt: null,
        validUntil: { gte: now },
        validFrom: { lte: now },
      },
      select: {
        includeTickets: true,
        validUntil: true,
        site: {
          select: {
            siteId: true,
            location: true,
            province: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    if (!link || !link.site) {
      return NextResponse.json(
        {
          success: false,
          message: 'Link expired or invalid',
          code: 'INVALID_OR_EXPIRED',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      site: {
        siteId: link.site.siteId,
        location: link.site.location,
        province: link.site.province,
        latitude: link.site.latitude ?? null,
        longitude: link.site.longitude ?? null,
      },
      access: {
        includeTicketsOffered: link.includeTickets === true,
        disclaimer:
          link.includeTickets === true
            ? 'Ticket details require signing in through the mobile app.'
            : 'Read-only preview: location summary only.',
      },
      validUntil: link.validUntil,
    });
  } catch (e) {
    console.error('GET /api/public/site-visit/[token]:', e);
    return NextResponse.json({ success: false, message: 'Failed to load visitor link' }, { status: 500 });
  }
}
