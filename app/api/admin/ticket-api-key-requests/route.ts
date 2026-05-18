import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-require';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ success: false, message: admin.message }, { status: admin.status });
  }

  try {
    const delegate = (prisma as { ticketApiKeyAccessRequest?: { findMany: Function } }).ticketApiKeyAccessRequest;
    if (!delegate?.findMany) {
      return NextResponse.json({ success: true, requests: [] });
    }

    const requests = await delegate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            name: true,
            company: true,
            phone: true,
            email: true,
            role: true,
            serviceSlug: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            keyPrefix: true,
            label: true,
            revokedAt: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    console.error('GET /api/admin/ticket-api-key-requests:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch requests' }, { status: 500 });
  }
}
