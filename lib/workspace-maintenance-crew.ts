/**
 * Workspace tickets: maintenance + inspection (QC) technique classification and
 * conflicting active field work (lead or extra crew) for crew-join rules.
 */

import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';

const LEGACY_MAINTENANCE_SLUGS = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

const ACTIVE_FIELD_STATUSES = new Set(['ON_SITE', 'IN_PROGRESS']);

export async function isWorkspaceMaintenanceTechnique(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client from route handlers
  prisma: any,
  companyId: string,
  technique: string | null | undefined
): Promise<boolean> {
  const slug = String(technique ?? '')
    .trim()
    .toLowerCase();
  if (!slug) return false;
  if (LEGACY_MAINTENANCE_SLUGS.includes(slug)) return true;
  try {
    const row = await prisma.privateCompanyTechnique.findFirst({
      where: {
        companyId,
        slug,
        category: 'MAINTENANCE',
        active: true,
      },
      select: { id: true },
    });
    if (row) return true;
  } catch {
    /* ignore */
  }
  try {
    const prov = await prisma.provisorTechnique.findFirst({
      where: { slug, category: 'MAINTENANCE', active: true },
      select: { id: true },
    });
    return Boolean(prov);
  } catch {
    return false;
  }
}

export async function isWorkspaceInspectionQcTechnique(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client from route handlers
  prisma: any,
  companyId: string,
  technique: string | null | undefined
): Promise<boolean> {
  const slug = String(technique ?? '')
    .trim()
    .toLowerCase();
  if (!slug) return false;
  try {
    const row = await prisma.privateCompanyTechnique.findFirst({
      where: {
        companyId,
        slug,
        category: 'INSPECTION_QC',
        active: true,
      },
      select: { id: true },
    });
    if (row) return true;
  } catch {
    /* ignore */
  }
  try {
    const prov = await prisma.provisorTechnique.findFirst({
      where: { slug, category: 'INSPECTION_QC', active: true },
      select: { id: true },
    });
    return Boolean(prov);
  } catch {
    return false;
  }
}

/** Workspace pool tickets that support multi-person crew (maintenance or QC inspection). */
export async function isWorkspaceCrewTicketTechnique(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  companyId: string,
  technique: string | null | undefined
): Promise<boolean> {
  if (await isWorkspaceMaintenanceTechnique(prisma, companyId, technique)) return true;
  if (await isWorkspaceInspectionQcTechnique(prisma, companyId, technique)) return true;
  return false;
}

export type ActiveMaintenanceConflict = {
  conflict: true;
  message: string;
};

export type ActiveMaintenanceOk = { conflict: false };

/**
 * True if the requester is already lead assignee or in `maintenanceCrewIds` on another
 * workspace ticket in ON_SITE / IN_PROGRESS (excluding excludeTicketId).
 */
export async function findActiveMaintenanceCrewConflict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client from route handlers
  prisma: any,
  args: { companyId: string; requesterId: string; excludeTicketId: string }
): Promise<ActiveMaintenanceConflict | ActiveMaintenanceOk> {
  const { companyId, requesterId, excludeTicketId } = args;
  if (!requesterId) return { conflict: false };

  const others = await prisma.visitorRequest.findMany({
    where: {
      privateCompanyId: companyId,
      assignmentScope: 'PRIVATE_COMPANY_STAFF',
      id: { not: excludeTicketId },
      status: { in: [...ACTIVE_FIELD_STATUSES] },
    },
    select: { id: true, company: true },
  });

  for (const row of others) {
    const parsed = parseTicketCompanyJson(row.company as string | null);
    const lead = assignedStaffIdFromCompanyJson(parsed);
    const crew = maintenanceCrewIdsFromCompanyJson(parsed);
    if (lead === requesterId) {
      return {
        conflict: true,
        message:
          'You already have an in-progress ticket as the assigned lead. Finish or leave that job before joining another crew.',
      };
    }
    if (crew.includes(requesterId)) {
      return {
        conflict: true,
        message:
          'You are already crew on another in-progress ticket. Leave that crew before joining this one.',
      };
    }
  }

  return { conflict: false };
}
