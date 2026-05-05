import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

type RequesterMini = {
  id: string;
  username: string;
  email?: string | null;
  role?: string | null;
};

export type CoordinatorLoginRow = {
  id: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  passwordHash: string;
  role?: string | null;
  status?: string | null;
  mustChangePassword?: boolean | null;
  companyId?: string | null;
};

/**
 * If this legacy COMPANY requester shares credentials with a coordinator
 * COMPANY_OWNER, return that coordinator row so login can issue a coordinator JWT
 * (companyId in token, billing, coordinator tickets).
 */
export async function tryCompanyOwnerCoordinatorInsteadOfLegacy(
  prisma: PrismaClient,
  requester: RequesterMini,
  password: string
): Promise<CoordinatorLoginRow | null> {
  if (String(requester.role ?? '').toUpperCase() !== 'COMPANY') return null;
  const or: Array<{ username?: { equals: string; mode: 'insensitive' }; email?: { equals: string; mode: 'insensitive' } }> = [
    { username: { equals: requester.username, mode: 'insensitive' } },
  ];
  const em = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
  if (em) {
    or.push({ email: { equals: em, mode: 'insensitive' } });
  }
  try {
    const owner = await (prisma as any).coordinatorUser.findFirst({
      where: {
        role: 'COMPANY_OWNER',
        OR: or,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        mustChangePassword: true,
        companyId: true,
      },
    });
    if (!owner) return null;
    const valid = await bcrypt.compare(password, owner.passwordHash);
    return valid ? owner : null;
  } catch {
    return null;
  }
}

/**
 * When a dashboard user is still on the legacy `ticket_requester` row (role COMPANY)
 * but the same person has a coordinator COMPANY_OWNER account (same username/email),
 * return their coordinator company id so ticket/checklist queries can include
 * coordinator-created work.
 */
export async function getLinkedCoordinatorCompanyId(
  prisma: PrismaClient,
  requester: RequesterMini
): Promise<string | null> {
  if (!requester || String(requester.role ?? '').toUpperCase() !== 'COMPANY') {
    return null;
  }
  const or: Array<{ username?: { equals: string; mode: 'insensitive' }; email?: { equals: string; mode: 'insensitive' } }> = [
    { username: { equals: requester.username, mode: 'insensitive' } },
  ];
  const em = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
  if (em) {
    or.push({ email: { equals: em, mode: 'insensitive' } });
  }
  try {
    const owner = await (prisma as any).coordinatorUser.findFirst({
      where: {
        role: 'COMPANY_OWNER',
        OR: or,
      },
      select: { companyId: true },
    });
    return owner?.companyId ?? null;
  } catch {
    return null;
  }
}

export function coordinatorRoleTicketWhere(
  companyId: string,
  role: string,
  departments: string[] = []
): { coordinatorCompanyId: string } & Record<string, unknown> {
  const where: { coordinatorCompanyId: string } & Record<string, unknown> = { coordinatorCompanyId: companyId };
  const r = String(role).toUpperCase();
  if (r === 'ADMIN' || r === 'COMPANY_OWNER' || r === 'MANAGER') {
    return where;
  }
  if (r === 'QUALITY_ENGINEER') {
    where.taskCategory = 'QUALITY';
    return where;
  }
  if (r === 'SUPERVISION_ENGINEER') {
    where.taskCategory = 'SUPERVISION';
    return where;
  }
  if (r === 'TECHNICIAN') {
    where.taskCategory = { in: ['MAINTENANCE'] };
    return where;
  }
  const normalizedDepartments = departments.map((d) => String(d).toUpperCase());
  const categories: string[] = [];
  if (normalizedDepartments.includes('QUALITY_CONTROL')) categories.push('QUALITY');
  if (normalizedDepartments.includes('SUPERVISION')) categories.push('SUPERVISION');
  if (
    normalizedDepartments.includes('NETWORK_MAINTENANCE') ||
    normalizedDepartments.includes('ELECTRICAL_DEPLOYMENTS') ||
    normalizedDepartments.includes('MECHANICAL')
  ) {
    categories.push('MAINTENANCE');
  }
  if (categories.length > 0) {
    where.taskCategory = { in: [...new Set(categories)] };
  }
  return where;
}
