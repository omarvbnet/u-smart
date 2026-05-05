import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

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
    const coordinatorContext = await getCoordinatorContext(req);
    const body = await req.json();
    const newStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';

    if (!['ON_SITE', 'IN_PROGRESS'].includes(newStatus)) {
      return NextResponse.json(
        { success: false, message: 'Can only set status to ON_SITE or IN_PROGRESS' },
        { status: 400 }
      );
    }

    if (coordinatorContext) {
      const ticket = await prisma.visitorRequest.findFirst({
        where: { id, coordinatorCompanyId: coordinatorContext.companyId },
        select: {
          id: true,
          status: true,
          workflowState: true,
          assigneeCoordinatorUserId: true,
          company: true,
        },
      });
      if (!ticket) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      const staffRoles = new Set(['QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'ENGINEER']);
      if (staffRoles.has(coordinatorContext.role)) {
        if (ticket.assigneeCoordinatorUserId && ticket.assigneeCoordinatorUserId !== coordinatorContext.userId) {
          return NextResponse.json(
            { success: false, message: 'Only assigned staff can update this ticket status.' },
            { status: 403 }
          );
        }
      }
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'IN_PROGRESS') updateData.workflowState = 'IN_PROGRESS';
      if (newStatus === 'COMPLETED') updateData.workflowState = 'DONE';

      let parsed: Record<string, unknown> = {};
      try {
        parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
      } catch {
        parsed = {};
      }
      parsed.status = newStatus;
      if (newStatus === 'IN_PROGRESS') parsed.workflowState = 'IN_PROGRESS';
      if (newStatus === 'COMPLETED') parsed.workflowState = 'DONE';
      updateData.company = JSON.stringify(parsed);

      await prisma.visitorRequest.update({
        where: { id },
        data: updateData,
      });

      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: newStatus },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ success: true, ticket: { id, status: newStatus } });
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

    if (row.requesterId) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'status_changed',
          ticketId: id,
          requesterId: row.requesterId,
          payload: {
            key: 'ticket_status_updated',
            vars: { statusKey: newStatus },
          },
          data: { ticketId: id, type: 'status_changed' },
        });
      } catch {
        /* ignore */
      }
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
