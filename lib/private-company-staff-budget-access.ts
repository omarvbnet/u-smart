import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type BudgetAccessActor = {
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
};

/** Owner, manager, or coordinator — may create/edit/delete staff material budgets. */
export function canManageStaffMaterialBudgets(actor: BudgetAccessActor): boolean {
  if (actor.isOwner) return true;
  const r = actor.actorRole.toUpperCase();
  return r === 'MANAGER' || r === 'COORDINATOR';
}

/**
 * Whether the actor may read budget rows for [targetStaffId] in the workspace.
 * Self, owner, warehouse keeper (assign workflow), manager/coordinator in scope.
 */
export async function canViewStaffMaterialBudgets(
  actor: BudgetAccessActor,
  targetStaffId: string
): Promise<boolean> {
  if (targetStaffId === actor.requesterId) return true;
  if (actor.isOwner) return true;
  const r = actor.actorRole.toUpperCase();
  if (r === 'WAREHOUSE_KEEPER') return true;
  if (r !== 'MANAGER' && r !== 'COORDINATOR') return false;
  const [target, me] = await Promise.all([
    prisma.ticketRequester.findFirst({
      where: { id: targetStaffId, privateCompanyId: actor.companyId },
      select: { privateCompanyDepartmentId: true },
    }),
    prisma.ticketRequester.findUnique({
      where: { id: actor.requesterId },
      select: { privateCompanyDepartmentId: true },
    }),
  ]);
  if (!target) return false;
  const d1 = me?.privateCompanyDepartmentId ?? null;
  const d2 = target.privateCompanyDepartmentId ?? null;
  if (!d1 || !d2) return false;
  return d1 === d2;
}

export async function assertStaffInCompany(companyId: string, staffId: string): Promise<boolean> {
  const owner = await prisma.privateCompany.findFirst({
    where: { id: companyId, ownerRequesterId: staffId },
    select: { id: true },
  });
  if (owner) return true;
  const staff = await prisma.ticketRequester.findFirst({
    where: { id: staffId, privateCompanyId: companyId },
    select: { id: true },
  });
  return !!staff;
}

export async function sumAssignedQuantityForStaffMaterial(args: {
  companyId: string;
  staffId: string;
  materialId: string;
  /** When splitting an existing line, exclude the row being decremented from the sum. */
  excludeItemId?: string;
}): Promise<number> {
  const where: Record<string, unknown> = {
    companyId: args.companyId,
    materialId: args.materialId,
    assignedToId: args.staffId,
    status: 'ASSIGNED',
  };
  if (args.excludeItemId) {
    where.NOT = { id: args.excludeItemId };
  }
  const agg = await prisma.privateCompanyMaterialItem.aggregate({
    where,
    _sum: { quantity: true },
  });
  return Math.max(0, Math.floor(Number(agg._sum?.quantity ?? 0) || 0));
}

export async function getStaffMaterialBudgetRow(
  companyId: string,
  staffId: string,
  materialId: string
): Promise<{ id: string; budgetQuantity: number } | null> {
  return prisma.privateCompanyStaffMaterialBudget.findUnique({
    where: {
      companyId_staffRequesterId_materialId: { companyId, staffRequesterId: staffId, materialId },
    },
    select: { id: true, budgetQuantity: true },
  });
}

/**
 * Returns null when no budget row exists (unlimited assignment for this SKU).
 * Otherwise remaining units the staff may still receive while ASSIGNED.
 */
export async function remainingAssignBudgetForStaffMaterial(args: {
  companyId: string;
  staffId: string;
  materialId: string;
  excludeItemId?: string;
}): Promise<{ unlimited: true } | { unlimited: false; cap: number; assigned: number; remaining: number }> {
  const row = await getStaffMaterialBudgetRow(args.companyId, args.staffId, args.materialId);
  if (!row) return { unlimited: true };
  const assigned = await sumAssignedQuantityForStaffMaterial({
    companyId: args.companyId,
    staffId: args.staffId,
    materialId: args.materialId,
    excludeItemId: args.excludeItemId,
  });
  const cap = Math.max(0, Math.floor(Number(row.budgetQuantity) || 0));
  const remaining = cap - assigned;
  return { unlimited: false, cap, assigned, remaining };
}
