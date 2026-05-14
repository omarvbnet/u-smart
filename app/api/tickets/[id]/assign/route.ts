import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';
import { fetchWorkspaceTechniqueRows, staffTicketTechniqueAllowed } from '@/lib/workspace-task-assignment';
import {
  MAINTENANCE_DISPATCH_ENGINEER,
  normalizeMaintenanceDispatchMode,
} from '@/lib/private-company-maintenance-dispatch';

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

    const body = await req.json().catch(() => ({}));
    const assigneeRequesterId =
      typeof body?.assigneeRequesterId === 'string' ? body.assigneeRequesterId.trim() : '';

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
    const roleUpper = (requester.role ?? 'COMPANY').toUpperCase();
    const isDispatcherRole =
      roleUpper === 'ENGINEER' ||
      roleUpper === 'QUALITY_ENGINEER' ||
      roleUpper === 'SUPERVISION_ENGINEER' ||
      roleUpper === 'MANAGER' ||
      roleUpper === 'COORDINATOR';
    if (!assigneeRequesterId && !isDispatcherRole && !isTechnician) {
      return NextResponse.json(
        { success: false, message: 'Only engineers, managers, or coordinators can use this action.' },
        { status: 403 },
      );
    }

    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        company: true,
        requesterId: true,
        technique: true,
        province: true,
        privateCompanyId: true,
        assignmentScope: true,
        privateCompanyTargetDepartmentId: true,
      },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
    const tech = (row.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(tech);

    if (assigneeRequesterId) {
      if (!isMaintenance) {
        return NextResponse.json(
          { success: false, message: 'assigneeRequesterId is only for maintenance tickets.' },
          { status: 400 },
        );
      }
      if (row.assignmentScope !== 'PRIVATE_COMPANY_STAFF' || !row.privateCompanyId) {
        return NextResponse.json(
          { success: false, message: 'This ticket is not a private workspace maintenance ticket.' },
          { status: 400 },
        );
      }
      const targetDeptId = row.privateCompanyTargetDepartmentId?.trim() || '';
      if (!targetDeptId) {
        return NextResponse.json(
          {
            success: false,
            message: 'Assign-to-technician requires the ticket to target a department.',
          },
          { status: 400 },
        );
      }
      const ownedCompany = await prisma.privateCompany.findFirst({
        where: { id: row.privateCompanyId, ownerRequesterId: requester.id },
        select: { id: true },
      });
      const isWorkspaceOwnerDispatcher = !!ownedCompany;
      if (!isDispatcherRole && !isWorkspaceOwnerDispatcher) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Only engineers, managers, coordinators, or the workspace owner can assign a technician.',
          },
          { status: 403 },
        );
      }
      const deptRow = await prisma.privateCompanyDepartment.findFirst({
        where: { id: targetDeptId, companyId: row.privateCompanyId },
        select: { maintenanceDispatchMode: true },
      });
      if (
        normalizeMaintenanceDispatchMode(deptRow?.maintenanceDispatchMode) !== MAINTENANCE_DISPATCH_ENGINEER
      ) {
        return NextResponse.json(
          {
            success: false,
            message: 'This department is configured for direct technician pool, not engineer dispatch.',
          },
          { status: 400 },
        );
      }
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
          { status: 403 },
        );
      }
      const myDept = meFull.privateCompanyDepartmentId ?? null;
      if (!isWorkspaceOwnerDispatcher) {
        if (!myDept || myDept !== targetDeptId) {
          return NextResponse.json(
            { success: false, message: 'You can only assign technicians in the same department as this ticket.' },
            { status: 403 },
          );
        }
        const techRows = await fetchWorkspaceTechniqueRows(prisma, row.privateCompanyId);
        const allowedSlugs = Array.isArray(meFull.privateCompanyAllowedTaskSlugs)
          ? meFull.privateCompanyAllowedTaskSlugs
          : [];
        if (
          !staffTicketTechniqueAllowed({
            technique: String(row.technique ?? ''),
            staffDepartmentId: myDept,
            staffAllowedSlugs: allowedSlugs,
            workspaceRows: techRows,
          })
        ) {
          return NextResponse.json(
            { success: false, message: 'This ticket is outside your department task scope.' },
            { status: 403 },
          );
        }
      }

      const assignee = await prisma.ticketRequester.findFirst({
        where: {
          id: assigneeRequesterId,
          privateCompanyId: row.privateCompanyId,
          role: 'TECHNICIAN',
          status: 'ACTIVE',
          privateCompanyDepartmentId: targetDeptId,
        },
        select: {
          id: true,
          name: true,
          username: true,
          province: true,
          provinceFilterActive: true,
        },
      });
      if (!assignee) {
        return NextResponse.json(
          { success: false, message: 'Technician not found in this department.' },
          { status: 404 },
        );
      }
      const ticketProvince = (row.province ?? '').trim();
      const filterActive = assignee.provinceFilterActive !== false;
      const ap = (assignee.province ?? '').trim();
      if (filterActive && ap && ticketProvince && ap.toLowerCase() !== ticketProvince.toLowerCase()) {
        return NextResponse.json(
          {
            success: false,
            message: 'Technician province filter does not match this ticket province.',
          },
          { status: 400 },
        );
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
          /* fallback */
        }
      }
      if (currentStatus !== 'PENDING') {
        return NextResponse.json(
          { success: false, message: 'Only PENDING tickets can be assigned' },
          { status: 400 },
        );
      }
      if (parsed._ticket && parsed.assignedEngineerId) {
        return NextResponse.json(
          { success: false, message: 'Ticket is already assigned' },
          { status: 400 },
        );
      }

      const activeTickets = await prisma.visitorRequest.findMany({
        where: { status: { not: 'COMPLETED' } },
        select: { id: true, company: true },
      });
      const assigneeBusy = activeTickets.some((t: { id: string; company: string | null }) => {
        if (t.id === id) return false;
        if (!t.company || typeof t.company !== 'string') return false;
        try {
          const p = JSON.parse(t.company) as { _ticket?: boolean; assignedEngineerId?: string };
          return p._ticket === true && p.assignedEngineerId === assignee.id;
        } catch {
          return false;
        }
      });
      if (assigneeBusy) {
        return NextResponse.json(
          { success: false, message: 'This technician already has an active ticket.' },
          { status: 400 },
        );
      }

      const newStatus = 'ON_SITE';
      parsed.assignedEngineerId = assignee.id;
      parsed.assignedEngineerName = assignee.name || assignee.username;
      parsed.assignedAt = new Date().toISOString();
      parsed.status = newStatus;
      if (!parsed._ticket) parsed._ticket = true;

      await prisma.visitorRequest.update({
        where: { id },
        data: { status: newStatus, company: JSON.stringify(parsed) },
      });
      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: newStatus },
        });
      } catch {
        /* ignore */
      }
      if (assignee.id) {
        try {
          await notifyRequesterI18n({
            prisma,
            type: 'status_changed',
            ticketId: id,
            requesterId: assignee.id,
            payload: {
              key: 'staff_assigned',
              vars: {
                staffKind: 'technician',
                assigneeName: assignee.name || assignee.username || '',
              },
            },
            data: { ticketId: id, type: 'status_changed' },
          });
        } catch {
          /* ignore */
        }
      }
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
                staffKind: 'technician',
                assigneeName: assignee.name || assignee.username || '',
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
          assignedEngineerId: assignee.id,
          assignedEngineerName: assignee.name || assignee.username,
        },
      });
    }

    if (!isEngineer && !isTechnician) {
      return NextResponse.json({ success: false, message: 'Only engineers or technicians can assign tickets' }, { status: 403 });
    }
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
      if (isTechnician && isMaintenance && row.privateCompanyTargetDepartmentId) {
        const dDispatch = await prisma.privateCompanyDepartment.findFirst({
          where: { id: row.privateCompanyTargetDepartmentId, companyId: row.privateCompanyId },
          select: { maintenanceDispatchMode: true },
        });
        const pendingUnassigned =
          currentStatus === 'PENDING' &&
          !(typeof parsed.assignedEngineerId === 'string' && (parsed.assignedEngineerId as string).trim());
        if (
          pendingUnassigned &&
          normalizeMaintenanceDispatchMode(dDispatch?.maintenanceDispatchMode) ===
            MAINTENANCE_DISPATCH_ENGINEER
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                'This maintenance ticket is assigned by an engineer or coordinator for your department.',
            },
            { status: 403 },
          );
        }
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
      const targetDept = row.privateCompanyTargetDepartmentId ?? null;
      if (targetDept && (deptId == null || deptId !== targetDept)) {
        return NextResponse.json(
          { success: false, message: 'This ticket is scoped to another department.' },
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
