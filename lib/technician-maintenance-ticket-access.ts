import {
  assignedStaffIdFromCompanyJson,
  parseTicketCompanyJson,
  ticketFieldStaffInvolvesRequester,
} from '@/lib/private-company-kpi';
import {
  MAINTENANCE_DISPATCH_ENGINEER,
  normalizeMaintenanceDispatchMode,
} from '@/lib/private-company-maintenance-dispatch';
import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';
import { lookupProvisorTechniqueCategory } from '@/lib/provisor-technique-lookup';
import { fetchWorkspaceTechniqueRows, staffTicketTechniqueAllowed } from '@/lib/workspace-task-assignment';

export type TechnicianMaintenanceTicketRow = {
  technique: string | null;
  assignmentScope?: string | null;
  privateCompanyId?: string | null;
  privateCompanyTargetDepartmentId?: string | null;
  province?: string | null;
  status?: string | null;
  company: string | null;
};

/**
 * Workspace + technique rules aligned with GET /api/tickets list for technicians.
 */
export async function assertTechnicianMaintenanceTicketDetailAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client from route handlers
  prismaAny: any,
  requesterId: string,
  workspaceId: string | null,
  row: TechnicianMaintenanceTicketRow
): Promise<boolean> {
  const slug = String(row.technique ?? '').trim();
  const lower = slug.toLowerCase();
  let fieldKind: 'MAINTENANCE' | 'INSPECTION_QC' | null = null;
  if (MAINTENANCE_TECHNIQUES.includes(lower)) {
    fieldKind = 'MAINTENANCE';
  } else if (slug) {
    const kind = await lookupProvisorTechniqueCategory(prismaAny, slug, { workspaceCompanyId: workspaceId });
    if (kind === 'MAINTENANCE' || kind === 'INSPECTION_QC') fieldKind = kind;
  }
  if (!fieldKind) return false;

  const scope = row.assignmentScope ?? null;
  const pcId = row.privateCompanyId ?? null;
  const isPrivateStaff = !!pcId && (scope === 'PRIVATE_COMPANY_STAFF' || scope === null);
  if (!isPrivateStaff) {
    return true;
  }
  if (!workspaceId || workspaceId !== pcId) return false;

  const parsed = parseTicketCompanyJson(row.company);
  if (ticketFieldStaffInvolvesRequester(parsed, requesterId)) return true;

  const meRow = await prismaAny.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      privateCompanyDepartmentId: true,
      privateCompanyAllowedTaskSlugs: true,
      province: true,
      provinceFilterActive: true,
    },
  });
  const deptId = meRow?.privateCompanyDepartmentId ?? null;
  const allowedSlugsRaw = meRow?.privateCompanyAllowedTaskSlugs;
  const allowedSlugs = Array.isArray(allowedSlugsRaw) ? allowedSlugsRaw : [];

  const techRows = await fetchWorkspaceTechniqueRows(prismaAny, workspaceId);
  if (
    !staffTicketTechniqueAllowed({
      technique: row.technique ?? '',
      staffDepartmentId: deptId,
      staffAllowedSlugs: allowedSlugs,
      workspaceRows: techRows,
    })
  ) {
    return false;
  }

  const targetDept = row.privateCompanyTargetDepartmentId ?? null;
  if (targetDept && deptId && targetDept !== deptId) return false;

  const pendingUnassigned =
    String(row.status ?? '').toUpperCase() === 'PENDING' && !assignedStaffIdFromCompanyJson(parsed);

  const provinceFilterActive = meRow?.provinceFilterActive ?? true;
  const requesterProvince = meRow?.province ?? null;
  if (
    pendingUnassigned &&
    provinceFilterActive &&
    requesterProvince?.trim() &&
    row.province &&
    String(row.province).trim().toLowerCase() !== requesterProvince.trim().toLowerCase()
  ) {
    return false;
  }

  if (pendingUnassigned && targetDept && fieldKind === 'MAINTENANCE') {
    try {
      const drow = await prismaAny.privateCompanyDepartment.findFirst({
        where: { id: targetDept, companyId: pcId },
        select: { maintenanceDispatchMode: true },
      });
      if (normalizeMaintenanceDispatchMode(drow?.maintenanceDispatchMode) === MAINTENANCE_DISPATCH_ENGINEER) {
        return false;
      }
    } catch {
      /* ignore */
    }
  }

  return true;
}
