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
    // Backward-compat for older DBs missing coordinator_users.username:
    // fall back to matching by email or local-part(email)=requester.username.
    try {
      const em = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
      const local = requester.username.trim().toLowerCase();
      const owner = await (prisma as any).coordinatorUser.findFirst({
        where: {
          role: 'COMPANY_OWNER',
          OR: em
            ? [
                { email: { equals: em, mode: 'insensitive' } },
                { email: { startsWith: `${local}@`, mode: 'insensitive' } },
              ]
            : [{ email: { startsWith: `${local}@`, mode: 'insensitive' } }],
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
    // Backward-compat: username column may be absent; use email matching.
    try {
      const local = requester.username.trim().toLowerCase();
      const em = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
      const owner = await (prisma as any).coordinatorUser.findFirst({
        where: {
          role: 'COMPANY_OWNER',
          OR: em
            ? [
                { email: { equals: em, mode: 'insensitive' } },
                { email: { startsWith: `${local}@`, mode: 'insensitive' } },
              ]
            : [{ email: { startsWith: `${local}@`, mode: 'insensitive' } }],
        },
        select: { companyId: true },
      });
      return owner?.companyId ?? null;
    } catch {
      return null;
    }
  }
}

export function coordinatorRoleTicketWhere(companyId: string, role: string): { coordinatorCompanyId: string } & Record<string, unknown> {
  const where: { coordinatorCompanyId: string } & Record<string, unknown> = { coordinatorCompanyId: companyId };
  const r = String(role).toUpperCase();
  if (r === 'QUALITY_ENGINEER') {
    where.taskCategory = 'QUALITY';
  } else if (r === 'SUPERVISION_ENGINEER') {
    where.taskCategory = 'SUPERVISION';
  } else if (r === 'TECHNICIAN') {
    where.taskCategory = 'MAINTENANCE';
  }
  return where;
}
