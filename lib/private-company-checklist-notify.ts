import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/** Notify active workspace staff in the checklist department (or entire workspace when unscoped). */
export async function notifyChecklistUpdatedForDepartment(args: {
  companyId: string;
  departmentId: string | null;
  checklistId: string;
  checklistName: string;
  excludeRequesterId: string;
}): Promise<void> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: args.companyId },
    select: { name: true, ownerRequesterId: true },
  });
  if (!company) return;

  const staffWhere: Record<string, unknown> = {
    privateCompanyId: args.companyId,
    status: { not: 'BLOCKED' },
    id: { not: args.excludeRequesterId },
  };
  if (args.departmentId) {
    staffWhere.privateCompanyDepartmentId = args.departmentId;
  }

  const staff = (await prisma.ticketRequester.findMany({
    where: staffWhere,
    select: { id: true },
  })) as Array<{ id: string }>;

  const recipientIds = new Set<string>(staff.map((s) => s.id));
  if (!args.departmentId && company.ownerRequesterId !== args.excludeRequesterId) {
    recipientIds.add(company.ownerRequesterId);
  }

  const companyName = String(company.name ?? '').trim() || 'Workspace';
  const checklistName = args.checklistName.trim() || 'Checklist';

  for (const requesterId of recipientIds) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'workspace_checklist_updated',
        requesterId,
        payload: {
          key: 'workspace_checklist_updated',
          vars: { checklistName, companyName },
        },
        data: {
          scope: 'private_company',
          companyId: args.companyId,
          checklistId: args.checklistId,
          type: 'workspace_checklist_updated',
        },
      });
    } catch {
      /* skip */
    }
  }
}
