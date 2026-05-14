import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';
import {
  MAINTENANCE_AWAITING_SINCE_KEY,
  MAINTENANCE_REJECT_REASON_KEY,
  MAINTENANCE_REQUESTER_CONFIRM_MINUTES,
  readMaintenanceAwaitingSince,
  readTicketJsonStatus,
} from '@/lib/maintenance-requester-confirmation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    const ticket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        company: true,
        requesterId: true,
        technique: true,
        beforeImageUrls: true,
        finishingImageUrls: true,
        coordinatorCompanyId: true,
        assigneeCoordinatorUserId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      /* ignore */
    }

    const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
    const crewIds = maintenanceCrewIdsFromCompanyJson(parsed);
    const fieldActor =
      assignedId === auth.payload.requesterId || crewIds.includes(auth.payload.requesterId);
    const assignedCoordinatorId =
      ticket.assigneeCoordinatorUserId ??
      (typeof parsed.assigneeCoordinatorUserId === 'string' ? parsed.assigneeCoordinatorUserId : null);
    if (coordinatorContext) {
      if (ticket.coordinatorCompanyId !== coordinatorContext.companyId) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      if (assignedCoordinatorId && assignedCoordinatorId !== coordinatorContext.userId) {
        return NextResponse.json({ success: false, message: 'Only assigned staff can complete this ticket' }, { status: 403 });
      }
    } else if (!fieldActor) {
      return NextResponse.json(
        { success: false, message: 'Only the assigned technician (or crew) can complete this ticket' },
        { status: 403 }
      );
    }

    if (ticket.status === 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Ticket is already completed' }, { status: 400 });
    }

    const tech = (ticket.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(tech);

    const body = await req.json();
    const checklistResponse = body.checklistResponse ?? null;

    // Maintenance: no checklist; require 4–6 before and 4–6 after images
    if (isMaintenance) {
      if (checklistResponse) {
        return NextResponse.json(
          { success: false, message: 'Maintenance tickets do not use checklists. Attach 4–6 before and 4–6 after photos and complete.' },
          { status: 400 }
        );
      }
      const effectiveStatusForEvidence = readTicketJsonStatus(parsed, String(ticket.status ?? 'PENDING'));
      if (effectiveStatusForEvidence !== 'IN_PROGRESS') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Before and after maintenance photos can only be submitted while the ticket is in progress.',
          },
          { status: 400 }
        );
      }
      const beforeUrls = Array.isArray(body.beforeImageUrls)
        ? body.beforeImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim())
        : [];
      const afterUrls = Array.isArray(body.finishingImageUrls)
        ? body.finishingImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim())
        : [];
      if (beforeUrls.length < 4 || beforeUrls.length > 6) {
        return NextResponse.json({ success: false, message: 'Before images must be between 4 and 6' }, { status: 400 });
      }
      if (afterUrls.length < 4 || afterUrls.length > 6) {
        return NextResponse.json({ success: false, message: 'After images must be between 4 and 6' }, { status: 400 });
      }
      parsed.beforeImageUrls = beforeUrls;
      parsed.finishingImageUrls = afterUrls;

      // Requester-confirmation flow (Provisor requester tickets only; coordinator dashboard unchanged)
      if (ticket.requesterId && !coordinatorContext) {
        const already = readMaintenanceAwaitingSince(parsed);
        if (already) {
          return NextResponse.json(
            { success: false, message: 'Already waiting for the requester to confirm completion.' },
            { status: 400 }
          );
        }
        if (!parsed._ticket) parsed._ticket = true;
        parsed[MAINTENANCE_AWAITING_SINCE_KEY] = new Date().toISOString();
        delete parsed[MAINTENANCE_REJECT_REASON_KEY];
        parsed.status = 'IN_PROGRESS';
        parsed.workflowState = 'IN_PROGRESS';

        await prisma.visitorRequest.update({
          where: { id },
          data: {
            status: 'IN_PROGRESS',
            workflowState: 'IN_PROGRESS',
            company: JSON.stringify(parsed),
            beforeImageUrls: beforeUrls,
            finishingImageUrls: afterUrls,
          },
        });

        try {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: ticket.requesterId,
            payload: {
              key: 'maintenance_awaiting_your_confirm',
              vars: {
                ticketId: id,
                minutes: String(MAINTENANCE_REQUESTER_CONFIRM_MINUTES),
              },
            },
            data: { ticketId: id, type: 'status_changed' },
          });
        } catch {
          /* ignore */
        }

        return NextResponse.json({
          success: true,
          message: 'Sent to the requester for confirmation.',
          awaitingRequesterConfirmation: true,
        });
      }
    }

    const inspectionResult = typeof body.inspectionResult === 'string' ? body.inspectionResult.trim().toLowerCase() : null;
    const inspectionComments = typeof body.inspectionComments === 'string' ? body.inspectionComments.trim() : null;
    const ncrReason = typeof body.ncrReason === 'string' ? body.ncrReason.trim() : inspectionResult === 'ncr' ? inspectionComments : null;
    const ncrImageUrls = Array.isArray(body.ncrImageUrls) ? body.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];

    const isNcr = inspectionResult === 'ncr';
    if (!isNcr) {
      parsed.status = 'COMPLETED';
      parsed.completedAt = new Date().toISOString();
      parsed.workflowState = 'DONE';
    } else {
      parsed.inspectionResult = 'ncr';
      parsed.ncrReason = ncrReason || inspectionComments || null;
      parsed.ncrImageUrls = ncrImageUrls.length > 0 ? ncrImageUrls : [];
      parsed.ncrResubmissions = Array.isArray(parsed.ncrResubmissions) ? parsed.ncrResubmissions : [];
      parsed.workflowState = 'IN_PROGRESS';
    }
    if (checklistResponse) {
      parsed.checklistResponse = checklistResponse;
      const items = Array.isArray(checklistResponse.items) ? checklistResponse.items : [];
      parsed.inspectionChecklist = items.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? ''),
        label: String(item.label ?? ''),
        checked: !!item.checked,
        result: typeof item.result === 'string' ? item.result : item.checked ? 'accepted' : 'rejected',
        comment: typeof item.comment === 'string' ? item.comment : typeof item.note === 'string' ? item.note : undefined,
        weight: typeof item.weight === 'string' ? item.weight : 'minor',
      }));
    }
    if (inspectionResult) {
      parsed.inspectionResult = inspectionResult;
    }
    if (inspectionComments) {
      parsed.inspectionComments = inspectionComments;
    }

    const updateData: Record<string, unknown> = {
      status: isNcr ? 'IN_PROGRESS' : 'COMPLETED',
      workflowState: isNcr ? 'IN_PROGRESS' : 'DONE',
      completedAt: isNcr ? null : new Date(),
      company: JSON.stringify(parsed),
      checklistResponse: checklistResponse ? JSON.stringify(checklistResponse) : undefined,
    };
    if (isMaintenance && !isNcr) {
      updateData.beforeImageUrls = parsed.beforeImageUrls ?? [];
      updateData.finishingImageUrls = parsed.finishingImageUrls ?? [];
    }
    await prisma.visitorRequest.update({
      where: { id },
      data: updateData,
    });

    if (!isNcr) {
      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: 'COMPLETED' },
        });
      } catch {
        /* ignore */
      }
    }

    if (ticket.requesterId) {
      try {
        if (isNcr) {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: ticket.requesterId,
            payload: { key: 'ticket_ncr_raised' },
            data: { ticketId: id, type: 'status_changed' },
          });
        } else {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: ticket.requesterId,
            payload: {
              key: 'ticket_completed',
              vars: { resultKey: typeof inspectionResult === 'string' ? inspectionResult : '' },
            },
            data: { ticketId: id, type: 'status_changed' },
          });
        }
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({ success: true, message: 'Ticket completed' });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/complete:', error);
    return NextResponse.json({ success: false, message: 'Failed to complete ticket' }, { status: 500 });
  }
}
