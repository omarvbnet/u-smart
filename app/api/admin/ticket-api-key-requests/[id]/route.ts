import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateTicketApiKey } from '@/lib/ticket-api-key-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const adminPayload = verifyToken(token);
  if (!adminPayload || adminPayload.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing request id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';

    const reqDelegate = (prisma as { ticketApiKeyAccessRequest?: { findUnique: Function; update: Function } })
      .ticketApiKeyAccessRequest;
    const keyDelegate = (prisma as { ticketApiKey?: { create: Function; updateMany: Function } }).ticketApiKey;
    if (!reqDelegate?.findUnique) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    const accessRequest = await reqDelegate.findUnique({
      where: { id },
      include: {
        requester: {
          select: { id: true, status: true, role: true },
        },
        apiKey: { select: { id: true, revokedAt: true } },
      },
    });
    if (!accessRequest) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
    if (accessRequest.status !== 'PENDING') {
      return NextResponse.json({ success: false, message: 'Request already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      const rejectionReason =
        typeof body.rejectionReason === 'string' ? body.rejectionReason.trim().slice(0, 500) : '';
      await reqDelegate.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason || 'Rejected by admin',
          reviewedAt: new Date(),
        },
      });
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    if (action === 'approve') {
      const requester = accessRequest.requester as { id: string; status?: string };
      if (requester.status === 'BLOCKED' || requester.status === 'SUSPENDED') {
        return NextResponse.json(
          { success: false, message: 'Requester account is blocked or suspended.' },
          { status: 400 }
        );
      }
      if (!keyDelegate?.create) {
        return NextResponse.json({ success: false, message: 'API keys not available' }, { status: 503 });
      }

      const keyLabel =
        typeof body.label === 'string' && body.label.trim()
          ? body.label.trim().slice(0, 120)
          : (accessRequest.label as string | null) || 'Ticket API';

      const { fullKey, prefix, hash } = generateTicketApiKey();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = prisma as any;
      await tx.ticketApiKeyAccessRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      const existingKey = accessRequest.apiKey as { id: string; revokedAt: Date | null } | null;
      if (existingKey?.id && !existingKey.revokedAt) {
        await tx.ticketApiKey.update({
          where: { id: existingKey.id },
          data: { revokedAt: new Date() },
        });
      }
      await tx.ticketApiKey.create({
        data: {
          requesterId: requester.id,
          accessRequestId: id,
          keyPrefix: prefix,
          keyHash: hash,
          label: keyLabel,
          createdByAdminId: (adminPayload as { sub?: string }).sub ?? null,
        },
      });

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        apiKey: fullKey,
        keyPrefix: prefix,
        message:
          'Copy this API key now. It will not be shown again. Use Authorization: Bearer <key> on POST /api/tickets.',
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/admin/ticket-api-key-requests/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to process request' }, { status: 500 });
  }
}
