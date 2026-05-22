import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { CAN_VIEW_ALL_WAREHOUSE_INVENTORY_ROLES } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const WORKSPACE_LOG_ACTIONS = [
  'STAFF_ADDED',
  'STAFF_UPDATED',
  'STAFF_REMOVED',
  'STAFF_PASSWORD_RESET',
  'DEPARTMENT_ADDED',
  'DEPARTMENT_SETTINGS_CHANGED',
  'DEPARTMENT_REMOVED',
  'MATERIAL_ADDED',
  'MATERIAL_UPDATED',
  'MATERIAL_REMOVED',
  'TOOL_STOCKED',
  'WORKSPACE_SETTINGS_CHANGED',
  'TICKET_CREATED',
  'TICKET_OPENED',
] as const;

export type WorkspaceLogAction = (typeof WORKSPACE_LOG_ACTIONS)[number];

export type WorkspaceLogInput = {
  companyId: string;
  actorRequesterId: string;
  action: WorkspaceLogAction | string;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  departmentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Fire-and-forget audit row; never throws to callers. */
export function logPrivateCompanyWorkspaceActivity(input: WorkspaceLogInput): void {
  void (async () => {
    try {
      if (!prisma.privateCompanyWorkspaceLog?.create) return;
      await prisma.privateCompanyWorkspaceLog.create({
        data: {
          companyId: input.companyId,
          actorRequesterId: input.actorRequesterId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          summary: input.summary.slice(0, 500),
          departmentId: input.departmentId ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (e) {
      console.error('private company workspace log:', e);
    }
  })();
}

const TICKET_OPEN_THROTTLE_MS = 30 * 60 * 1000;

/** Log ticket detail views at most once per actor/ticket per 30 minutes. */
export async function logPrivateCompanyTicketOpened(input: {
  companyId: string;
  actorRequesterId: string;
  ticketId: string;
  summary: string;
  departmentId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    if (!prisma.privateCompanyWorkspaceLog?.findFirst) {
      logPrivateCompanyWorkspaceActivity({
        ...input,
        action: 'TICKET_OPENED',
        resourceType: 'ticket',
        resourceId: input.ticketId,
      });
      return;
    }
    const since = new Date(Date.now() - TICKET_OPEN_THROTTLE_MS);
    const recent = await prisma.privateCompanyWorkspaceLog.findFirst({
      where: {
        companyId: input.companyId,
        actorRequesterId: input.actorRequesterId,
        resourceId: input.ticketId,
        action: 'TICKET_OPENED',
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return;
    logPrivateCompanyWorkspaceActivity({
      ...input,
      action: 'TICKET_OPENED',
      resourceType: 'ticket',
      resourceId: input.ticketId,
    });
  } catch (e) {
    console.error('logPrivateCompanyTicketOpened:', e);
  }
}

export type WorkspaceActivityGuardSuccess = {
  ok: true;
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorDepartmentId: string | null;
  scopeDepartmentId: string | null;
};

export type WorkspaceActivityGuardFailure = {
  ok: false;
  response: NextResponse;
};

export async function workspaceActivityGuard(
  req: NextRequest
): Promise<WorkspaceActivityGuardSuccess | WorkspaceActivityGuardFailure> {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Not authenticated.' }, { status: 401 }),
    };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId || !m.isActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'You are not part of an active private workspace.' },
        { status: 403 }
      ),
    };
  }
  const isOwner =
    !!m.ownedCompanyId &&
    m.ownedCompanyStatus === 'APPROVED' &&
    m.ownedCompanyId === m.effectiveCompanyId;

  let actorRole = 'COMPANY';
  let actorDepartmentId: string | null = null;
  if (!isOwner) {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, privateCompanyDepartmentId: true },
    });
    actorRole = String(me?.role ?? '').toUpperCase();
    actorDepartmentId = me?.privateCompanyDepartmentId ?? null;
    if (!CAN_VIEW_ALL_WAREHOUSE_INVENTORY_ROLES.has(actorRole) && actorRole !== 'COMPANY') {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            message: 'Only the owner, managers, coordinators, or warehouse keepers can view workspace activity.',
          },
          { status: 403 }
        ),
      };
    }
  }

  return {
    ok: true,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner,
    actorDepartmentId,
    scopeDepartmentId: isOwner ? null : actorDepartmentId,
  };
}

export const WORKSPACE_LOG_ACTION_LABELS: Record<string, string> = {
  STAFF_ADDED: 'Staff added',
  STAFF_UPDATED: 'Staff updated',
  STAFF_REMOVED: 'Staff removed',
  STAFF_PASSWORD_RESET: 'Password reset',
  DEPARTMENT_ADDED: 'Department added',
  DEPARTMENT_SETTINGS_CHANGED: 'Department settings changed',
  DEPARTMENT_REMOVED: 'Department removed',
  MATERIAL_ADDED: 'Material catalog added',
  MATERIAL_UPDATED: 'Material catalog updated',
  MATERIAL_REMOVED: 'Material removed',
  TOOL_STOCKED: 'Stock received',
  WORKSPACE_SETTINGS_CHANGED: 'Workspace settings changed',
  TICKET_CREATED: 'Ticket created',
  TICKET_OPENED: 'Ticket opened',
};
