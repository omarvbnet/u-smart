import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';
import { fetchWorkspaceTechniqueRows, staffTicketTechniqueAllowed } from '@/lib/workspace-task-assignment';

const prisma = _prisma as any;

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
    if (coordinatorContext) {
      const body = await req.json();
      const assigneeId = typeof body.assigneeCoordinatorUserId === 'string' ? body.assigneeCoordinatorUserId.trim() : '';
      if (!assigneeId) {
        return NextResponse.json({ success: false, message: 'assigneeCoordinatorUserId is required.' }, { status: 400 });
      }
      const assignerRoles = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']);
      if (!assignerRoles.has(coordinatorContext.role) && !hasPrivilege(coordinatorContext.privileges, 'ASSIGN_TASKS')) {
        return NextResponse.json({ success: false, message: 'Only coordinators can assign tickets.' }, { status: 403 });
      }

      const ticket = await prisma.visitorRequest.findFirst({
        where: { id, coordinatorCompanyId: coordinatorContext.companyId },
        select: { id: true, company: true, taskCategory: true, status: true },
      });
      if (!ticket) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }

      const assignee = await prisma.coordinatorUser.findFirst({
        where: { id: assigneeId, companyId: coordinatorContext.companyId, status: 'ACTIVE' },
        select: { id: true, role: true, name: true, username: true },
      });
      if (!assignee) {
        return NextResponse.json({ success: false, message: 'Assignee not found in your company.' }, { status: 404 });
      }
      const roleByCategory: Record<string, string> = {
        QUALITY: 'QUALITY_ENGINEER',
        SUPERVISION: 'SUPERVISION_ENGINEER',
        MAINTENANCE: 'TECHNICIAN',
      };
      const requiredRole = roleByCategory[ticket.taskCategory ?? ''] ?? null;
      const assigneeRole = String(assignee.role ?? '').toUpperCase();
      const roleMatch =
        !requiredRole ||
        assigneeRole === requiredRole ||
        assigneeRole === 'ENGINEER' ||
        assigneeRole === 'COORDINATOR' ||
        assigneeRole === 'TEAM_LEADER' ||
        assigneeRole === 'MANAGER';
      if (!roleMatch) {
        return NextResponse.json({ success: false, message: `Assignee role must be ${requiredRole}.` }, { status: 400 });
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
      } catch {
        parsed = {};
      }
      parsed.assigneeCoordinatorUserId = assignee.id;
      parsed.assignedEngineerName = assignee.name || assignee.username;
      parsed.assignedAt = new Date().toISOString();
      parsed.status = 'ON_SITE';
      parsed.workflowState = 'IN_PROGRESS';
      if (!parsed._ticket) parsed._ticket = true;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          assigneeCoordinatorUserId: assignee.id,
          status: 'ON_SITE',
          workflowState: 'IN_PROGRESS',
          company: JSON.stringify(parsed),
        },
      });
      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: 'ON_SITE' },
        });
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        success: true,
        ticket: {
          id,
          status: 'ON_SITE',
          assigneeCoordinatorUserId: assignee.id,
          assignedEngineerName: assignee.name || assignee.username,
        },
      });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, name: true, username: true, role: true },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
    }

    const role = requester.role ?? 'COMPANY';
    const isEngineer = role === 'ENGINEER';
    const isTechnician = role === 'TECHNICIAN';
    if (!isEngineer && !isTechnician) {
      return NextResponse.json({ success: false, message: 'Only engineers or technicians can assign tickets' }, { status: 403 });
    }

    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        company: true,
        requesterId: true,
        technique: true,
        privateCompanyId: true,
        assignmentScope: true,
      },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
    const tech = (row.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(tech);
    if (isTechnician && !isMaintenance) {
      return NextResponse.json({ success: false, message: 'Technicians can only assign maintenance tickets' }, { status: 403 });
    }
    if (isEngineer && isMaintenance) {
      return NextResponse.json({ success: false, message: 'Engineers handle QC only; maintenance tickets are for technicians' }, { status: 403 });
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

    if (currentStatus !== 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Only PENDING tickets can be assigned' },
        { status: 400 }
      );
    }

    if (parsed._ticket && parsed.assignedEngineerId) {
      return NextResponse.json(
        { success: false, message: 'Ticket is already assigned' },
        { status: 400 }
      );
    }

    const roleUpper = (requester.role ?? 'COMPANY').toUpperCase();
    const isQcPoolRole =
      roleUpper === 'ENGINEER' ||
      roleUpper === 'QUALITY_ENGINEER' ||
      roleUpper === 'SUPERVISION_ENGINEER';

    if (row.assignmentScope === 'PRIVATE_COMPANY_STAFF' && row.privateCompanyId) {
      const meFull = await prisma.ticketRequester.findUnique({
        where: { id: requester.id },
        select: {
          privateCompanyId: true,
          privateCompanyDepartmentId: true,
          privateCompanyAllowedTaskSlugs: true,
        },
      });
      if (!meFull || meFull.privateCompanyId !== row.privateCompanyId) {
        return NextResponse.json(
          { success: false, message: 'You are not a member of this ticket workspace.' },
          { status: 403 }
        );
      }
      const deptId = meFull.privateCompanyDepartmentId ?? null;
      let engineerPoolOk = true;
      let technicianPoolOk = true;
      if (deptId) {
        const d = await prisma.privateCompanyDepartment.findFirst({
          where: { id: deptId, companyId: row.privateCompanyId },
          select: {
            engineerAvailabilityPoolEnabled: true,
            technicianAvailabilityPoolEnabled: true,
          },
        });
        if (d) {
          engineerPoolOk = d.engineerAvailabilityPoolEnabled !== false;
          technicianPoolOk = d.technicianAvailabilityPoolEnabled !== false;
        }
      }
      if (isTechnician && !technicianPoolOk) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Your department cannot self-assign from the maintenance availability pool. Contact the workspace owner.',
          },
          { status: 403 }
        );
      }
      if (isQcPoolRole && !isTechnician && !engineerPoolOk) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Your department cannot self-assign from the QC availability pool. Contact the workspace owner.',
          },
          { status: 403 }
        );
      }
      const techRows = await fetchWorkspaceTechniqueRows(prisma, row.privateCompanyId);
      const allowedSlugs = Array.isArray(meFull.privateCompanyAllowedTaskSlugs)
        ? meFull.privateCompanyAllowedTaskSlugs
        : [];
      if (
        !staffTicketTechniqueAllowed({
          technique: String(row.technique ?? ''),
          staffDepartmentId: deptId,
          staffAllowedSlugs: allowedSlugs,
          workspaceRows: techRows,
        })
      ) {
        return NextResponse.json(
          { success: false, message: 'This ticket is outside your department task scope.' },
          { status: 403 }
        );
      }
    }

    // Check if engineer already has an uncompleted assigned ticket.
    // We parse ticket JSON payload instead of raw string search to avoid false positives.
    const activeTickets = await prisma.visitorRequest.findMany({
      where: {
        status: { not: 'COMPLETED' },
      },
      select: { id: true, company: true },
    });
    const hasActiveAssignedTicket = activeTickets.some((t: { id: string; company: string | null }) => {
      if (t.id === id) return false;
      if (!t.company || typeof t.company !== 'string') return false;
      try {
        const payload = JSON.parse(t.company) as { _ticket?: boolean; assignedEngineerId?: string };
        return payload._ticket === true && payload.assignedEngineerId === requester.id;
      } catch {
        return false;
      }
    });
    if (hasActiveAssignedTicket) {
      return NextResponse.json(
        { success: false, message: 'You already have an active ticket. Complete it before taking a new one.' },
        { status: 400 }
      );
    }

    const newStatus = 'ON_SITE';

    parsed.assignedEngineerId = requester.id;
    parsed.assignedEngineerName = requester.name || requester.username;
    parsed.assignedAt = new Date().toISOString();
    parsed.status = newStatus;
    if (!parsed._ticket) parsed._ticket = true;

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: newStatus,
        company: JSON.stringify(parsed),
      },
    });

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
            key: 'staff_assigned',
            vars: {
              staffKind: isTechnician ? 'technician' : 'engineer',
              assigneeName: requester.name || requester.username || '',
            },
          },
          data: { ticketId: id, type: 'status_changed' },
        });
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id,
        status: newStatus,
        assignedEngineerId: requester.id,
        assignedEngineerName: requester.name || requester.username,
      },
    });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/assign:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to assign ticket' },
      { status: 500 }
    );
  }
}
