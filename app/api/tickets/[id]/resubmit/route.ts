import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  assignedStaffIdFromCompanyJson,
  parseTicketCompanyJson,
  ticketFieldStaffInvolvesRequester,
} from '@/lib/private-company-kpi';
import { assertReasonInList, loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';
import {
  isTicketCompletedForResubmit,
  readResubmitMeta,
  RESUBMIT_TARGET_COORDINATOR,
  RESUBMIT_TARGET_REQUESTER,
  RESUBMIT_TARGET_STAFF,
  resubmissionHoursBetween,
  type ResubmissionCycle,
} from '@/lib/ticket-resubmit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ENGINEERING_ROLES = new Set([
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'ENGINEER',
]);

const WORKSPACE_FIELD_ROLES = new Set([
  'ENGINEER',
  'TECHNICIAN',
  'WORKER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const coordinatorContext = await getCoordinatorContext(req);
    const { id } = await params;

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const targetRaw = typeof body.target === 'string' ? body.target.trim().toUpperCase() : 'COORDINATOR';
    const target = targetRaw || 'COORDINATOR';

    const ticket = await prisma.visitorRequest.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        workflowState: true,
        company: true,
        requesterId: true,
        assigneeCoordinatorUserId: true,
        coordinatorCompanyId: true,
        privateCompanyId: true,
        assignmentScope: true,
      },
    });
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (isTicketCompletedForResubmit(ticket.status, ticket.workflowState)) {
      return NextResponse.json(
        { success: false, message: 'Cannot resubmit a completed or cancelled ticket.' },
        { status: 400 }
      );
    }

    let parsed = parseTicketCompanyJson(ticket.company);

    const isRequesterReturnToStaff =
      !coordinatorContext &&
      ticket.requesterId === auth.payload.requesterId &&
      target === RESUBMIT_TARGET_STAFF;

    const reason = isRequesterReturnToStaff
      ? rawReason || 'Requester returned ticket to field staff.'
      : rawReason;

    if (!reason) {
      return NextResponse.json({ success: false, message: 'Resubmit reason is required.' }, { status: 400 });
    }

    if (!isRequesterReturnToStaff) {
      const policy = await loadPlatformTicketPolicy();
      const reasonCheck = assertReasonInList(reason, policy.resubmitReasons, 'Resubmit reasons');
      if (!reasonCheck.ok) {
        return NextResponse.json(
          { success: false, message: reasonCheck.message, code: reasonCheck.code },
          { status: 400 }
        );
      }
    }

    if (coordinatorContext) {
      if (!ENGINEERING_ROLES.has(coordinatorContext.role)) {
        return NextResponse.json(
          { success: false, message: 'Only engineering staff can resubmit tickets.' },
          { status: 403 }
        );
      }
      if (ticket.coordinatorCompanyId !== coordinatorContext.companyId) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      if (
        ticket.assigneeCoordinatorUserId &&
        ticket.assigneeCoordinatorUserId !== coordinatorContext.userId
      ) {
        return NextResponse.json(
          { success: false, message: 'Only assigned engineer/technician can resubmit.' },
          { status: 403 }
        );
      }

      const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
      history.push({
        at: new Date().toISOString(),
        byUserId: coordinatorContext.userId,
        byRole: coordinatorContext.role,
        target: target || RESUBMIT_TARGET_COORDINATOR,
        reason,
      });
      parsed.resubmitHistory = history;
      parsed.workflowState = 'RESUBMITTED';
      parsed.resubmitReason = reason;
      parsed.resubmitTarget = RESUBMIT_TARGET_COORDINATOR;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          workflowState: 'RESUBMITTED',
          resubmittedAt: new Date(),
          resubmittedByCoordinatorUserId: coordinatorContext.userId,
          resubmitReason: reason,
          company: JSON.stringify(parsed),
        },
      });

      return NextResponse.json({ success: true, message: 'Ticket resubmitted for edits.' });
    }

    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true },
    });
    const myRole = String(me?.role ?? '').toUpperCase();

    // Field staff (workspace, company, personal) → ticket requester
    if (
      WORKSPACE_FIELD_ROLES.has(myRole) &&
      ticketFieldStaffInvolvesRequester(parsed, auth.payload.requesterId) &&
      ticket.requesterId
    ) {
      if (target === RESUBMIT_TARGET_STAFF) {
        return NextResponse.json(
          { success: false, message: 'Field staff must resubmit to the requester, not to staff.' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
      history.push({
        at: now,
        byUserId: auth.payload.requesterId,
        byRole: myRole,
        target: RESUBMIT_TARGET_REQUESTER,
        reason,
      });
      parsed.resubmitHistory = history;
      parsed.workflowState = 'RESUBMITTED';
      parsed.resubmitReason = reason;
      parsed.resubmitTarget = RESUBMIT_TARGET_REQUESTER;
      parsed.resubmitPendingAt = now;

      const cycles = Array.isArray(parsed.resubmissionCycles)
        ? (parsed.resubmissionCycles as ResubmissionCycle[])
        : [];
      cycles.push({
        staffSubmittedAt: now,
        reason,
        byUserId: auth.payload.requesterId,
        byRole: myRole,
      });
      parsed.resubmissionCycles = cycles;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          workflowState: 'RESUBMITTED',
          resubmittedAt: new Date(),
          resubmitReason: reason,
          company: JSON.stringify(parsed),
        },
      });

      if (ticket.requesterId) {
        try {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: ticket.requesterId,
            payload: { key: 'ticket_resubmit_to_requester', vars: { reason } },
            data: { ticketId: id, type: 'resubmit_to_requester' },
          });
        } catch {
          /* ignore */
        }
      }

      return NextResponse.json({ success: true, message: 'Ticket sent to requester for edits.' });
    }

    // Ticket requester → staff (after editing)
    if (ticket.requesterId === auth.payload.requesterId && target === RESUBMIT_TARGET_STAFF) {
      const workflowState = String(ticket.workflowState ?? parsed.workflowState ?? '').toUpperCase();
      const { resubmitTarget, resubmitPendingAt } = readResubmitMeta(parsed);
      if (workflowState !== 'RESUBMITTED' || resubmitTarget !== RESUBMIT_TARGET_REQUESTER) {
        return NextResponse.json(
          {
            success: false,
            message: 'You can only return a ticket to staff after they requested your edits.',
          },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const hours = resubmitPendingAt ? resubmissionHoursBetween(resubmitPendingAt, now) : 0;

      const cycles = Array.isArray(parsed.resubmissionCycles)
        ? (parsed.resubmissionCycles as ResubmissionCycle[])
        : [];
      if (cycles.length > 0) {
        const last = cycles[cycles.length - 1];
        if (!last.requesterReturnedAt) {
          last.requesterReturnedAt = now;
          last.hours = hours;
        }
      }

      const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
      history.push({
        at: now,
        byUserId: auth.payload.requesterId,
        byRole: myRole || 'COMPANY',
        target: RESUBMIT_TARGET_STAFF,
        reason: reason || 'Requester returned ticket to field staff.',
      });
      parsed.resubmitHistory = history;
      parsed.resubmissionCycles = cycles;
      parsed.workflowState = 'IN_PROGRESS';
      parsed.status = 'IN_PROGRESS';
      parsed.resubmitReason = null;
      parsed.resubmitTarget = null;
      delete parsed.resubmitPendingAt;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          workflowState: 'IN_PROGRESS',
          status: 'IN_PROGRESS',
          resubmitReason: null,
          company: JSON.stringify(parsed),
        },
      });

      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: 'IN_PROGRESS' },
        });
      } catch {
        /* optional table */
      }

      const staffId = assignedStaffIdFromCompanyJson(parsed);
      if (staffId) {
        try {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: staffId,
            payload: { key: 'ticket_resubmit_to_staff', vars: { reason } },
            data: { ticketId: id, type: 'resubmit_to_staff' },
          });
        } catch {
          /* ignore */
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Ticket returned to field staff.',
        resubmissionHours: hours,
      });
    }

    // Legacy requester flow (coordinator tickets without workspace scope)
    if (ticket.requesterId !== auth.payload.requesterId) {
      return NextResponse.json(
        { success: false, message: 'Not allowed to update this ticket' },
        { status: 403 }
      );
    }

    const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
    history.push({
      at: new Date().toISOString(),
      byUserId: auth.payload.requesterId,
      byRole: myRole || 'COMPANY',
      target,
      reason,
    });
    parsed.resubmitHistory = history;
    parsed.workflowState = 'RESUBMITTED';
    parsed.resubmitReason = reason;

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        company: JSON.stringify(parsed),
        workflowState: 'RESUBMITTED',
        resubmittedAt: new Date(),
        resubmitReason: reason,
      },
    });
    return NextResponse.json({ success: true, message: 'Ticket resubmitted for edits.' });
  } catch (err) {
    console.error('POST /api/tickets/[id]/resubmit:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to resubmit ticket' },
      { status: 500 }
    );
  }
}
