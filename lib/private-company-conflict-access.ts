import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type WorkspaceConflictManageContext = {
  companyId: string;
  isOwner: boolean;
  departmentId: string | null;
};

/** Workspace owner or department manager / coordinator may manage conflict cases. */
export async function getWorkspaceConflictManageContext(
  requesterId: string
): Promise<WorkspaceConflictManageContext | null> {
  const m = await getPrivateCompanyMembership(requesterId);
  if (!m.effectiveCompanyId) return null;

  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { status: true },
  });
  if (!company || company.status !== 'APPROVED') return null;

  const isOwner =
    !!m.ownedCompanyId &&
    m.ownedCompanyStatus === 'APPROVED' &&
    m.ownedCompanyId === m.effectiveCompanyId;
  if (isOwner) {
    return { companyId: m.effectiveCompanyId, isOwner: true, departmentId: null };
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { role: true, privateCompanyId: true, privateCompanyDepartmentId: true },
  });
  if (!me?.privateCompanyId || me.privateCompanyId !== m.effectiveCompanyId) return null;

  const role = String(me.role ?? '').toUpperCase();
  if (role !== 'MANAGER' && role !== 'COORDINATOR') return null;
  const departmentId = me.privateCompanyDepartmentId ?? null;
  if (!departmentId) return null;

  return {
    companyId: m.effectiveCompanyId,
    isOwner: false,
    departmentId,
  };
}

export function ticketInWorkspaceConflictScope(
  ticket: {
    privateCompanyId?: string | null;
    privateCompanyTargetDepartmentId?: string | null;
  },
  ctx: WorkspaceConflictManageContext
): boolean {
  if (ticket.privateCompanyId !== ctx.companyId) return false;
  if (ctx.isOwner) return true;
  const target = ticket.privateCompanyTargetDepartmentId ?? null;
  if (!target) return false;
  return target === ctx.departmentId;
}

/** Notify workspace owner + managers/coordinators when a conflict is reported on a scoped ticket. */
export async function notifyWorkspaceConflictReported(args: {
  ticketId: string;
  privateCompanyId: string;
  targetDepartmentId: string | null;
  siteName: string;
  isMaintenance: boolean;
}): Promise<void> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: args.privateCompanyId },
    select: {
      name: true,
      ownerRequesterId: true,
      staff: {
        where: { status: 'ACTIVE', role: { in: ['MANAGER', 'COORDINATOR'] } },
        select: { id: true, privateCompanyDepartmentId: true, role: true },
      },
    },
  });
  if (!company) return;

  const recipientIds = new Set<string>([company.ownerRequesterId]);
  for (const s of (company.staff ?? []) as Array<{
    id: string;
    privateCompanyDepartmentId: string | null;
    role: string | null;
  }>) {
    if (args.targetDepartmentId) {
      if (s.privateCompanyDepartmentId !== args.targetDepartmentId) continue;
    }
    recipientIds.add(s.id);
  }

  const siteLabel = args.siteName.trim() || args.ticketId;
  for (const requesterId of recipientIds) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'workspace_conflict_reported',
        ticketId: args.ticketId,
        requesterId,
        payload: {
          key: 'workspace_conflict_reported',
          vars: {
            siteName: siteLabel,
            kind: args.isMaintenance ? 'maintenance' : 'qc',
          },
        },
        data: { ticketId: args.ticketId, type: 'workspace_conflict_reported' },
      });
    } catch {
      /* skip */
    }
  }
}
