import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { isWorkspaceTicketLeader } from '@/lib/private-company-ticket-visibility';
import { assertTechnicianMaintenanceTicketDetailAccess } from '@/lib/technician-maintenance-ticket-access';

function isWorkspaceScopedTicket(ticket: {
  assignmentScope: string | null;
  privateCompanyId: string | null;
}): boolean {
  const scope = ticket.assignmentScope ?? null;
  return (
    !!ticket.privateCompanyId &&
    (scope === 'PRIVATE_COMPANY_STAFF' || scope === null)
  );
}

/**
 * Who may add QField revisions / edit project metadata on a ticket.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function canManageTicketQFieldProjects(prisma: any, ticketId: string, requesterId: string): Promise<boolean> {
  const ticket = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: {
      requesterId: true,
      privateCompanyId: true,
      assignmentScope: true,
      company: true,
      technique: true,
      status: true,
      privateCompanyTargetDepartmentId: true,
      province: true,
    },
  });
  if (!ticket) return false;
  if (ticket.requesterId === requesterId) return true;

  const me = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      role: true,
      privateCompanyId: true,
      privateCompanyDepartmentId: true,
      privateCompanyOwned: { select: { id: true, status: true } },
    },
  });
  if (!me) return false;
  const role = String(me.role ?? '').toUpperCase();
  const parsed = parseTicketCompanyJson(ticket.company);
  const lead = assignedStaffIdFromCompanyJson(parsed);
  const crew = maintenanceCrewIdsFromCompanyJson(parsed);
  if (lead === requesterId || crew.includes(requesterId)) return true;

  const owned = me.privateCompanyOwned?.status === 'APPROVED' ? me.privateCompanyOwned.id ?? null : null;
  const workspaceId = owned ?? me.privateCompanyId ?? null;

  if (isWorkspaceScopedTicket(ticket) && workspaceId && workspaceId === ticket.privateCompanyId) {
    if (owned && owned === ticket.privateCompanyId) {
      return true;
    }
    if (isWorkspaceTicketLeader(role, owned)) {
      return true;
    }
  }

  if (role === 'TECHNICIAN') {
    if (!ticket.privateCompanyId) return false;
    return assertTechnicianMaintenanceTicketDetailAccess(prisma, requesterId, workspaceId, ticket);
  }

  if (
    (role === 'ENGINEER' || role === 'MANAGER' || role === 'COORDINATOR') &&
    isWorkspaceScopedTicket(ticket) &&
    workspaceId === ticket.privateCompanyId
  ) {
    const target = ticket.privateCompanyTargetDepartmentId ?? null;
    const myDept = me.privateCompanyDepartmentId ?? null;
    if (target && (myDept == null || myDept !== target)) return false;
    return true;
  }

  if (role === 'ENGINEER') {
    const row = await prisma.visitorRequest.findFirst({ where: { id: ticketId }, select: { id: true } });
    return !!row;
  }

  return false;
}
