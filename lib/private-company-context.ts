import type { NextRequest } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type PrivateCompanyMembership = {
  /** APPROVED workspace this requester owns. */
  ownedCompanyId: string | null;
  ownedCompanyStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null;
  /** Workspace this requester is a staff member of. */
  staffCompanyId: string | null;
  /** Department of the requester (when they are staff). */
  departmentId: string | null;
  /** Effective workspace id — owner OR staff. */
  effectiveCompanyId: string | null;
  /** True when the requester's workspace is APPROVED and they can use it. */
  isActive: boolean;
};

const STAFF_ROLES = new Set(['MANAGER', 'COORDINATOR', 'ENGINEER', 'TECHNICIAN', 'WORKER']);

export const PRIVATE_COMPANY_STAFF_ROLES = ['MANAGER', 'COORDINATOR', 'ENGINEER', 'TECHNICIAN', 'WORKER'] as const;
export type PrivateCompanyStaffRole = (typeof PRIVATE_COMPANY_STAFF_ROLES)[number];

export const CAN_CREATE_CHECKLIST_ROLES = new Set([
  'MANAGER',
  'COORDINATOR',
  'ENGINEER',
  // owner is COMPANY-role and can also create checklists
  'COMPANY',
]);

/** Roles that can manage workspace staff (add / edit / reset password / soft remove). */
export const CAN_MANAGE_STAFF_ROLES = new Set(['MANAGER', 'COORDINATOR', 'COMPANY']);

/**
 * Roles that can create / edit / delete departments. Department structure is
 * a workspace-wide concern, so it is intentionally restricted to the COMPANY
 * owner (the only requester whose role is `COMPANY` inside a workspace).
 */
export const CAN_MANAGE_DEPARTMENTS_ROLES = new Set(['COMPANY']);

/** Roles a manager / coordinator is allowed to grant when adding a staff member. */
export const MANAGER_CAN_GRANT_STAFF_ROLES = new Set(['ENGINEER', 'TECHNICIAN', 'WORKER']);

/** Roles inside a workspace that can create tickets for the workspace. */
export const CAN_CREATE_TICKETS_ROLES = new Set([
  'COMPANY',
  'MANAGER',
  'COORDINATOR',
  'ENGINEER',
]);

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role.toUpperCase());
}

export async function getPrivateCompanyMembership(
  requesterId: string
): Promise<PrivateCompanyMembership> {
  const requester = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      privateCompanyId: true,
      privateCompanyDepartmentId: true,
      privateCompanyOwned: { select: { id: true, status: true } },
    },
  });
  const ownedCompanyId = requester?.privateCompanyOwned?.id ?? null;
  const ownedCompanyStatus = requester?.privateCompanyOwned?.status ?? null;
  const staffCompanyId = requester?.privateCompanyId ?? null;
  const departmentId = requester?.privateCompanyDepartmentId ?? null;
  const effectiveCompanyId =
    ownedCompanyStatus === 'APPROVED'
      ? ownedCompanyId
      : staffCompanyId;
  const isActive = ownedCompanyStatus === 'APPROVED' || !!staffCompanyId;
  return {
    ownedCompanyId,
    ownedCompanyStatus,
    staffCompanyId,
    departmentId,
    effectiveCompanyId,
    isActive,
  };
}

/**
 * Resolve the workspace context for a NextRequest. Returns null when the user
 * has no active private-company workspace (or is not authenticated).
 */
export async function getPrivateCompanyContext(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return null;
  const membership = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!membership.effectiveCompanyId) return null;
  return {
    requesterId: auth.payload.requesterId,
    companyId: membership.effectiveCompanyId,
    isOwner: membership.ownedCompanyId === membership.effectiveCompanyId,
    departmentId: membership.departmentId,
    membership,
  };
}

/**
 * IDs (owner + every staff member) inside a workspace. Used by ticket and
 * notification queries so all workspace members see the same data.
 */
export async function getWorkspaceRequesterIds(companyId: string): Promise<string[]> {
  const company = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: {
      ownerRequesterId: true,
      staff: { select: { id: true } },
    },
  });
  if (!company) return [];
  const ids = new Set<string>([company.ownerRequesterId]);
  for (const s of (company.staff ?? []) as Array<{ id: string }>) {
    ids.add(s.id);
  }
  return [...ids];
}
