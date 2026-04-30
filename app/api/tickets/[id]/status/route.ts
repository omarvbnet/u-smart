import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { sendPushToRequesters } from '@/lib/push-notifications';

const prisma = _prisma as any;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ON_SITE: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
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
        { success: false, message: 'Can only set status to ON_SITE or IN_PROGRESS' },
        { status: 400 }
      );
    }

    let requesterRole = 'COMPANY';
    try {
      const reqRow = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true },
      });
      requesterRole = reqRow?.role ?? 'COMPANY';
    } catch { /* fallback */ }

    let row: any;
    if (requesterRole === 'ENGINEER' || requesterRole === 'TECHNICIAN') {
      row = await prisma.visitorRequest.findUnique({
        where: { id },
        select: { id: true, status: true, company: true, requesterId: true },
      });
    } else {
      row = await prisma.visitorRequest.findFirst({
        where: { id, requesterId: auth.payload.requesterId },
        select: { id: true, status: true, company: true, requesterId: true },
      });
    }

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
      } catch { /* fallback */ }
    }

    if (requesterRole === 'ENGINEER' || requesterRole === 'TECHNICIAN') {
      const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
      if (assignedId !== auth.payload.requesterId) {
        return NextResponse.json(
          { success: false, message: 'Only the assigned technician/engineer can update this ticket' },
          { status: 403 }
        );
      }
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
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
    } catch { /* ignore */ }

    const statusLabels: Record<string, string> = {
      ON_SITE: 'On Site',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
    };

    // Notify company about status change
    if (row.requesterId && typeof prisma.notification?.create === 'function') {
      try {
        const message = `Your ticket status is now: ${statusLabels[newStatus] || newStatus}`;
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: 'Ticket status updated',
            message,
            ticketId: id,
            requesterId: row.requesterId,
            forAdmin: false,
          },
        });
        await sendPushToRequesters(prisma, [row.requesterId], {
          title: 'Ticket status updated',
          body: message,
          data: { ticketId: id, type: 'status_changed' },
        });
      } catch { /* ignore */ }
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
