import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  assertNotBlockedForCancellation,
  CANCELLATION_REASON_KEY,
  CANCELLATION_REJECTED_AT_KEY,
  CANCELLATION_REJECTION_REASON_KEY,
  CANCELLATION_REQUEST_STATUS_KEY,
  CANCELLATION_REQUESTED_AT_KEY,
  hasPendingCancellationRequest,
  isAssignedFieldStaff,
  readCancellationFromParsed,
} from '@/lib/ticket-cancellation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * POST /api/tickets/[id]/cancellation-respond
 * Body: { action: "approve" | "reject", rejectionReason?: string }
 * Assigned lead or crew: approve → CANCELLED; reject → clears pending request.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { success: false, message: 'action must be approve or reject' },
      { status: 400 }
    );
  }

  const ticket = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requesterId: true,
      company: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }

  if (!isAssignedFieldStaff(parsed, auth.payload.requesterId)) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the assigned lead or crew on this ticket can respond to a cancellation request.',
      },
      { status: 403 }
    );
  }

  if (!hasPendingCancellationRequest(parsed)) {
    return NextResponse.json(
      { success: false, message: 'There is no pending cancellation request on this ticket.' },
      { status: 400 }
    );
  }

  if (action === 'approve') {
    const blocked = assertNotBlockedForCancellation(ticket.status);
    if (!blocked.ok) {
      return NextResponse.json({ success: false, message: blocked.message }, { status: 400 });
    }
    if (String(ticket.status ?? '').toUpperCase() !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          message:
            'Cannot approve cancellation after staff have gone on site or work has started. Reject the request instead.',
        },
        { status: 400 }
      );
    }

    parsed.status = 'CANCELLED';
    delete parsed[CANCELLATION_REQUEST_STATUS_KEY];
    delete parsed[CANCELLATION_REQUESTED_AT_KEY];
    delete parsed[CANCELLATION_REASON_KEY];
    delete parsed[CANCELLATION_REJECTED_AT_KEY];
    delete parsed[CANCELLATION_REJECTION_REASON_KEY];

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        company: JSON.stringify(parsed),
      },
    });
    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: 'CANCELLED' },
      });
    } catch {
      /* ignore */
    }

    if (ticket.requesterId) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'status_changed',
          ticketId: id,
          requesterId: ticket.requesterId,
          payload: { key: 'ticket_cancellation_approved', vars: {} },
          data: { ticketId: id, type: 'cancellation_approved' },
        });
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      success: true,
      status: 'CANCELLED',
      cancellation: readCancellationFromParsed(parsed),
    });
  }

  const rejectionReason =
    typeof body?.rejectionReason === 'string' ? body.rejectionReason.trim().slice(0, 500) : '';
  parsed[CANCELLATION_REQUEST_STATUS_KEY] = 'REJECTED';
  parsed[CANCELLATION_REJECTED_AT_KEY] = new Date().toISOString();
  if (rejectionReason) parsed[CANCELLATION_REJECTION_REASON_KEY] = rejectionReason;

  await prisma.visitorRequest.update({
    where: { id },
    data: { company: JSON.stringify(parsed) },
  });

  if (ticket.requesterId) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId: id,
        requesterId: ticket.requesterId,
        payload: {
          key: 'ticket_cancellation_rejected',
          vars: { reason: rejectionReason || '—' },
        },
        data: { ticketId: id, type: 'cancellation_rejected' },
      });
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    success: true,
    cancellation: readCancellationFromParsed(parsed),
  });
}
