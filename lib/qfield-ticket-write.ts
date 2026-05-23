import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { PRIVATE_COMPANY_STAFF_ROLES } from '@/lib/private-company-context';
import { isWorkspaceTicketLeader } from '@/lib/private-company-ticket-visibility';
import { assertTechnicianMaintenanceTicketDetailAccess } from '@/lib/technician-maintenance-ticket-access';

export function isWorkspaceScopedTicket(ticket: {
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

function workspaceIdForRequester(me: {
  privateCompanyId: string | null;
  privateCompanyOwned: { id: string; status: string } | null;
}): string | null {
  const owned =
    me.privateCompanyOwned?.status === 'APPROVED' ? me.privateCompanyOwned.id ?? null : null;
  return owned ?? me.privateCompanyId ?? null;
}

/**
 * Read-only QField map preview / view button: any active private-workspace staff role
 * on tickets scoped to that workspace (owner, manager, coordinator, engineer, technician,
 * worker, warehouse keeper).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function canPreviewTicketQFieldProjects(
  prisma: any,
  ticketId: string,
  requesterId: string
): Promise<boolean> {
  if (await canManageTicketQFieldProjects(prisma, ticketId, requesterId)) return true;

  const ticket = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: {
      requesterId: true,
      privateCompanyId: true,
      assignmentScope: true,
    },
  });
  if (!ticket) return false;
  if (ticket.requesterId === requesterId) return true;
  if (!isWorkspaceScopedTicket(ticket) || !ticket.privateCompanyId) return false;

  const me = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      role: true,
      privateCompanyId: true,
      privateCompanyOwned: { select: { id: true, status: true } },
    },
  });
  if (!me) return false;
  const role = String(me.role ?? '').toUpperCase();
  if (!(PRIVATE_COMPANY_STAFF_ROLES as readonly string[]).includes(role)) return false;
  const wsId = workspaceIdForRequester(me);
  return !!wsId && wsId === ticket.privateCompanyId;
}
