import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  MAINTENANCE_AWAITING_SINCE_KEY,
  MAINTENANCE_REJECT_REASON_KEY,
  readMaintenanceAwaitingSince,
} from '@/lib/maintenance-requester-confirmation';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';

const prisma = _prisma as any;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === 'string' ? body.reason.trim() : typeof body?.comment === 'string' ? body.comment.trim() : '';
  if (!reason || reason.length < 3) {
    return NextResponse.json(
      { success: false, message: 'Please provide a rejection reason (at least 3 characters).' },
      { status: 400 }
    );
  }

  const ticket = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      status: true,
      requesterId: true,
    },
  });
  if (!ticket?.requesterId || ticket.requesterId !== auth.payload.requesterId) {
    return NextResponse.json(
      { success: false, message: 'Only the ticket requester can reject at this step.' },
      { status: 403 }
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }
  if (!readMaintenanceAwaitingSince(parsed)) {
    return NextResponse.json(
      { success: false, message: 'This ticket is not waiting for your confirmation.' },
      { status: 400 }
    );
  }

  delete parsed[MAINTENANCE_AWAITING_SINCE_KEY];
  parsed[MAINTENANCE_REJECT_REASON_KEY] = reason;
  if (!parsed._ticket) parsed._ticket = true;
  parsed.status = 'IN_PROGRESS';
  parsed.workflowState = 'IN_PROGRESS';

  await prisma.visitorRequest.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      workflowState: 'IN_PROGRESS',
      company: JSON.stringify(parsed),
    },
  });

  const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId.trim() : '';
  const crew = maintenanceCrewIdsFromCompanyJson(parsed);
  const notifyIds = new Set<string>();
  if (assignedId) notifyIds.add(assignedId);
  for (const c of crew) notifyIds.add(c);

  for (const rid of notifyIds) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId: id,
        requesterId: rid,
        payload: {
          key: 'maintenance_rejected_by_requester',
          vars: { ticketId: id, reason },
        },
        data: { ticketId: id, type: 'status_changed' },
      });
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ success: true, message: 'Feedback sent to the maintenance team.' });
}
