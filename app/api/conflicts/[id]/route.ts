import type { Prisma, TicketStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';
import {
  isMissingVisitorRequestsCoordinatorCompanyIdColumn,
  invalidateVisitorRequestsCoordinatorCompanyIdCache,
} from '@/lib/visitor-request-db-columns';
import { isConflictInspectionLowercase, rowToConflictPayload } from '@/lib/qc-conflict-mapper';
import {
  getWorkspaceConflictManageContext,
  ticketInWorkspaceConflictScope,
} from '@/lib/private-company-conflict-access';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

const VALID_RESOLUTIONS = ['accepted', 'not_accepted', 'ncr', 'accepted_with_comments', 're_inspection', 'keep_same', 're_maintain', 'no_need'];

function rowToConflict(row: unknown): Record<string, unknown> | null {
  const mapped = rowToConflictPayload(row);
  if (!mapped) return mapped;
  delete mapped.serviceSlug;
  delete mapped.updatedAt;
  return mapped;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const coordinatorContext = await getCoordinatorContext(req);

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Conflict ID required' }, { status: 400 });
  }

  try {
    let row: {
      id: string;
      company: string | null;
      status: string;
      requesterId: string | null;
      technique: string;
      coordinatorCompanyId?: string | null;
      privateCompanyId?: string | null;
      privateCompanyTargetDepartmentId?: string | null;
    } | null;
    let coordinatorColumnSelectable = true;
    try {
      row = await prisma.visitorRequest.findUnique({
        where: { id },
        select: {
          id: true,
          company: true,
          status: true,
          requesterId: true,
          technique: true,
          coordinatorCompanyId: true,
          privateCompanyId: true,
          privateCompanyTargetDepartmentId: true,
        },
      });
    } catch (e: unknown) {
      if (isMissingVisitorRequestsCoordinatorCompanyIdColumn(e)) {
        invalidateVisitorRequestsCoordinatorCompanyIdCache();
        coordinatorColumnSelectable = false;
        row = await prisma.visitorRequest.findUnique({
          where: { id },
          select: {
            id: true,
            company: true,
            status: true,
            requesterId: true,
            technique: true,
            privateCompanyId: true,
            privateCompanyTargetDepartmentId: true,
          },
        });
      } else {
        throw e;
      }
    }

    if (!row) {
      return NextResponse.json({ success: false, message: 'Conflict not found' }, { status: 404 });
    }

    let parsedCheck: Record<string, unknown> = {};
    try {
      parsedCheck = typeof row.company === 'string' ? JSON.parse(row.company) : {};
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 500 });
    }
    const assignedEngineerId = parsedCheck.assignedEngineerId as string | undefined;
    const isOwner = row.requesterId === auth.payload.requesterId;
    const isAssigned = assignedEngineerId === auth.payload.requesterId;
    const coordinatorCompanyId = coordinatorColumnSelectable
      ? (row.coordinatorCompanyId ?? null)
      : null;
    const isCoordinatorAllowed =
      coordinatorContext &&
      coordinatorColumnSelectable &&
      coordinatorCompanyId === coordinatorContext.companyId &&
      (coordinatorContext.role === 'ADMIN' ||
        coordinatorContext.role === 'COMPANY_OWNER' ||
        coordinatorContext.role === 'MANAGER' ||
        hasPrivilege(coordinatorContext.privileges, 'MANAGE_CONFLICTS'));
    const wsCtx = await getWorkspaceConflictManageContext(auth.payload.requesterId);
    const isWorkspaceManagerAllowed =
      !!wsCtx &&
      ticketInWorkspaceConflictScope(
        {
          privateCompanyId: row.privateCompanyId ?? null,
          privateCompanyTargetDepartmentId: row.privateCompanyTargetDepartmentId ?? null,
        },
        wsCtx
      );
    if (!isOwner && !isAssigned && !isCoordinatorAllowed && !isWorkspaceManagerAllowed) {
      return NextResponse.json({ success: false, message: 'Conflict not found' }, { status: 404 });
    }

    if (parsedCheck.conflictReported !== true && row.status === 'COMPLETED') {
      const ir = ((parsedCheck.inspectionResult as string) ?? '').toLowerCase();
      if (isConflictInspectionLowercase(ir)) {
        parsedCheck.conflictReported = true;
        parsedCheck.conflictStatus = 'pending';
      }
    }

    const conflict = rowToConflict({ ...row, technique: row.technique, company: JSON.stringify(parsedCheck) });
    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('GET /api/conflicts/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch conflict' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const coordinatorContext = await getCoordinatorContext(req);
  let requesterRole = 'COMPANY';
  if (!coordinatorContext) {
    try {
      const reqRow = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true },
      });
      requesterRole = reqRow?.role ?? 'COMPANY';
    } catch {
      /* ignore */
    }
  }

  const wsManageCtx = await getWorkspaceConflictManageContext(auth.payload.requesterId);

  const canResolveAsCoordinator =
    coordinatorContext &&
    (coordinatorContext.role === 'ADMIN' ||
      coordinatorContext.role === 'COMPANY_OWNER' ||
      coordinatorContext.role === 'MANAGER' ||
      hasPrivilege(coordinatorContext.privileges, 'MANAGE_CONFLICTS'));
  const canResolveAsWorkspaceManager = !!wsManageCtx;
  if (
    !canResolveAsCoordinator &&
    !canResolveAsWorkspaceManager &&
    requesterRole !== 'ENGINEER' &&
    requesterRole !== 'ADMIN'
  ) {
    return NextResponse.json({ success: false, message: 'Only authorized roles can resolve conflicts' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Conflict ID required' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : null;
  const comment = typeof body.comment === 'string' ? body.comment.trim() : null;

  if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { success: false, message: `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    let ticket: {
      id: string;
      company: string | null;
      requesterId: string | null;
      technique: string;
      privateCompanyId?: string | null;
      privateCompanyTargetDepartmentId?: string | null;
    } | null = null;

    if (canResolveAsWorkspaceManager && wsManageCtx) {
      ticket = await prisma.visitorRequest.findFirst({
        where: { id, privateCompanyId: wsManageCtx.companyId },
        select: {
          id: true,
          company: true,
          requesterId: true,
          technique: true,
          privateCompanyId: true,
          privateCompanyTargetDepartmentId: true,
        },
      });
      if (
        ticket &&
        !ticketInWorkspaceConflictScope(
          {
            privateCompanyId: ticket.privateCompanyId ?? null,
            privateCompanyTargetDepartmentId: ticket.privateCompanyTargetDepartmentId ?? null,
          },
          wsManageCtx
        )
      ) {
        ticket = null;
      }
    } else {
      const whereClause: any = { id };
      if (coordinatorContext) {
        whereClause.coordinatorCompanyId = coordinatorContext.companyId;
      } else if (requesterRole !== 'ADMIN') {
        whereClause.company = { contains: auth.payload.requesterId };
      }

      try {
        ticket = await prisma.visitorRequest.findFirst({
          where: whereClause,
          select: { id: true, company: true, requesterId: true, technique: true },
        });
      } catch (e: unknown) {
        if (isMissingVisitorRequestsCoordinatorCompanyIdColumn(e)) {
          invalidateVisitorRequestsCoordinatorCompanyIdCache();
          if (coordinatorContext) {
            return NextResponse.json(
              {
                success: false,
                message:
                  'Database migration required for coordinator conflict actions. Run: npx prisma migrate deploy',
              },
              { status: 503 }
            );
          }
        }
        throw e;
      }
    }

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Conflict not found or not assigned to you' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 500 });
    }

    const isMaintenanceResolution = resolution === 're_maintain' || resolution === 'no_need';
    parsed.conflictStatus = (resolution === 're_inspection' || resolution === 'keep_same') ? 're_inspection' : 'resolved';
    parsed.conflictResolvedBy = auth.payload.requesterId;
    parsed.conflictResolvedAt = new Date().toISOString();
    parsed.conflictResolution = resolution;
    if (comment) parsed.conflictResolutionComment = comment;

    let newTicketStatus: TicketStatus | null = null;
    if (resolution === 're_maintain') {
      parsed.status = 'PENDING';
      newTicketStatus = 'PENDING';
    } else if (resolution === 're_inspection') {
      // Preserve previous inspection (checklist, comments, result) in history before clearing
      const checklistHistory = Array.isArray(parsed.checklistHistory) ? parsed.checklistHistory : [];
      if (parsed.inspectionChecklist || parsed.inspectionResult || parsed.inspectionComments) {
        checklistHistory.push({
          at: new Date().toISOString(),
          inspectionChecklist: parsed.inspectionChecklist ?? [],
          inspectionResult: parsed.inspectionResult ?? null,
          inspectionComments: parsed.inspectionComments ?? null,
        });
      }
      parsed.checklistHistory = checklistHistory;
      parsed.inspectionResult = null;
      parsed.inspectionComments = null;
      parsed.inspectionChecklist = null;
      parsed.checklistResponse = null;
      parsed.status = 'IN_PROGRESS';
      newTicketStatus = 'IN_PROGRESS';
    } else if (resolution !== 'keep_same' && !isMaintenanceResolution) {
      parsed.inspectionResult = resolution;
    }

    const updateData: { company: string; status?: TicketStatus; completedAt?: null } = {
      company: JSON.stringify(parsed),
    };
    if (newTicketStatus) {
      updateData.status = newTicketStatus;
      updateData.completedAt = null;
    }

    await prisma.visitorRequest.update({
      where: { id },
      data: updateData,
    });

    if (newTicketStatus === 'IN_PROGRESS' || newTicketStatus === 'PENDING') {
      try {
        await prisma.ticketStatusLog.create({
          data: {
            visitorRequestId: id,
            status: newTicketStatus,
          },
        });
      } catch {
        /* ticketStatusLog may not exist */
      }
    }

    if (canResolveAsWorkspaceManager) {
      const recipientIds = new Set<string>();
      if (ticket.requesterId) recipientIds.add(ticket.requesterId);
      const handlerId =
        typeof parsed.assignedEngineerId === 'string' && parsed.assignedEngineerId
          ? (parsed.assignedEngineerId as string)
          : null;
      if (handlerId) recipientIds.add(handlerId);
      const siteName = String(parsed.siteName ?? '').trim();
      const isReinspection = resolution === 're_inspection' || resolution === 'keep_same';
      const isMaintenanceResolution = resolution === 're_maintain' || resolution === 'no_need';
      const isOverride =
        !isReinspection &&
        !isMaintenanceResolution &&
        resolution !== 'keep_same' &&
        resolution !== 'no_need';
      const previousResult = String(parsed.inspectionResult ?? '').toLowerCase();

      for (const requesterId of recipientIds) {
        try {
          if (isReinspection) {
            await notifyRequesterI18n({
              prisma,
              type: 'conflict_reinspection',
              ticketId: id,
              requesterId,
              payload: { key: 'conflict_reinspection', vars: { siteName } },
              data: { ticketId: id, type: 'conflict_reinspection' },
            });
          } else {
            const resultKey = isMaintenanceResolution
              ? resolution
              : isOverride
                ? resolution
                : previousResult || 'accepted';
            await notifyRequesterI18n({
              prisma,
              type: 'conflict_resolved',
              ticketId: id,
              requesterId,
              payload: { key: 'conflict_resolved', vars: { siteName, resultKey } },
              data: { ticketId: id, type: 'conflict_resolved', resolution },
            });
          }
        } catch (e) {
          console.error('notifyRequesterI18n (workspace conflict):', e);
        }
      }
    }

    const conflict = rowToConflict({ ...ticket, technique: ticket.technique, company: JSON.stringify(parsed) });
    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('PATCH /api/conflicts/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to resolve conflict' },
      { status: 500 }
    );
  }
}
