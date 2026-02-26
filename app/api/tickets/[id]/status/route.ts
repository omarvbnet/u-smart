import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

const ALLOWED_TRANSITIONS: Record<string, string> = {
  PENDING: 'ON_SITE',
  ON_SITE: 'IN_PROGRESS',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const newStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';

    if (!['ON_SITE', 'IN_PROGRESS'].includes(newStatus)) {
      return NextResponse.json(
        { success: false, message: 'Requesters can only set status to ON_SITE or IN_PROGRESS' },
        { status: 400 }
      );
    }

    const row = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: { id: true, status: true, company: true },
    });

    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let currentStatus = row.status ?? 'PENDING';
    let parsed: Record<string, unknown> = {};
    if (typeof row.company === 'string') {
      try {
        parsed = JSON.parse(row.company) as Record<string, unknown>;
        if (parsed._ticket && typeof parsed.status === 'string') {
          currentStatus = parsed.status;
        }
      } catch {
        /* use column status */
      }
    }

    if (ALLOWED_TRANSITIONS[currentStatus] !== newStatus) {
      return NextResponse.json(
        { success: false, message: `Cannot transition from ${currentStatus} to ${newStatus}` },
        { status: 400 }
      );
    }

    if (parsed._ticket) {
      parsed.status = newStatus;
      await prisma.visitorRequest.update({
        where: { id },
        data: {
          status: newStatus,
          company: JSON.stringify(parsed),
        },
      });
    } else {
      await prisma.visitorRequest.update({
        where: { id },
        data: { status: newStatus },
      });
    }

    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: newStatus },
      });
    } catch {
      /* TicketStatusLog may not exist */
    }

    return NextResponse.json({
      success: true,
      ticket: { id, status: newStatus },
    });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/status:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update ticket status' },
      { status: 500 }
    );
  }
}
