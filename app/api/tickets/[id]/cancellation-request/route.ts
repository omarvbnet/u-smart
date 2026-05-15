import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { assertReasonInList, loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';
import {
  assertNotBlockedForCancellation,
  canRequesterRequestCancellation,
  CANCELLATION_REASON_KEY,
  CANCELLATION_REJECTED_AT_KEY,
  CANCELLATION_REJECTION_REASON_KEY,
  CANCELLATION_REQUEST_STATUS_KEY,
  CANCELLATION_REQUESTED_AT_KEY,
  hasPendingCancellationRequest,
  readCancellationFromParsed,
  ticketFieldStaffIds,
} from '@/lib/ticket-cancellation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * POST /api/tickets/[id]/cancellation-request
 * Body: { reason: string }
 * Ticket requester only; allowed while status is PENDING (assigned or unassigned).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) {
    return NextResponse.json(
      {
        success: false,
        code: 'CANCELLATION_REASON_REQUIRED',
        message: 'Cancellation reason is required (max 500 characters).',
      },
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
      privateCompanyId: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }
  if (ticket.requesterId !== auth.payload.requesterId) {
    return NextResponse.json(
      { success: false, message: 'Only the ticket requester can request cancellation.' },
      { status: 403 }
    );
  }

  const blocked = assertNotBlockedForCancellation(ticket.status);
  if (!blocked.ok) {
    return NextResponse.json(
      { success: false, code: 'CANCELLATION_STATUS_BLOCKED', message: blocked.message },
      { status: 400 }
    );
  }
  if (!canRequesterRequestCancellation(ticket.status)) {
    return NextResponse.json(
      {
        success: false,
        code: 'CANCELLATION_STATUS_NOT_PENDING',
        message:
          'Cancellation can only be requested while the ticket is still pending (not on site or in progress).',
      },
      { status: 400 }
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }
  if (!parsed._ticket) parsed._ticket = true;

  if (hasPendingCancellationRequest(parsed)) {
    return NextResponse.json(
      { success: false, message: 'A cancellation request is already pending staff review.' },
      { status: 409 }
    );
  }

  const policy = await loadPlatformTicketPolicy();
  const reasonCheck = assertReasonInList(
    reason,
    policy.cancellationReasons,
    'Cancellation reasons'
  );
  if (!reasonCheck.ok) {
    return NextResponse.json(
      {
        success: false,
        code: reasonCheck.code ?? 'CANCELLATION_REASON_REJECTED',
        message: reasonCheck.message,
      },
      { status: 400 }
    );
  }

  parsed[CANCELLATION_REQUEST_STATUS_KEY] = 'PENDING';
  parsed[CANCELLATION_REQUESTED_AT_KEY] = new Date().toISOString();
  parsed[CANCELLATION_REASON_KEY] = reason;
  delete parsed[CANCELLATION_REJECTED_AT_KEY];
  delete parsed[CANCELLATION_REJECTION_REASON_KEY];

  await prisma.visitorRequest.update({
    where: { id },
    data: { company: JSON.stringify(parsed) },
  });

  const staffIds = ticketFieldStaffIds(parsed);
  for (const staffId of staffIds) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId: id,
        requesterId: staffId,
        payload: {
          key: 'ticket_cancellation_requested',
          vars: { reason },
        },
        data: { ticketId: id, type: 'cancellation_requested' },
      });
    } catch {
      /* ignore */
    }
  }

  const cancellation = readCancellationFromParsed(parsed);
  return NextResponse.json({
    success: true,
    cancellation,
  });
}
