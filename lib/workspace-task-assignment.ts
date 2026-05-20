/**
 * Workspace-scoped ticket visibility: techniques configured per department
 * (PrivateCompanyTechnique) plus optional per-staff slug allowlist.
 */

import {
  engineerScopeAllowsMaintenance,
  engineerScopeAllowsQc,
  type EngineerTicketScope,
} from '@/lib/engineer-ticket-scope';
import {
  MAINTENANCE_DISPATCH_ENGINEER,
  normalizeMaintenanceDispatchMode,
} from '@/lib/private-company-maintenance-dispatch';
import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';

/** Private workspace field engineers (mobile assign + list). Primary role is ENGINEER. */
export function isWorkspaceEngineerRole(role: string | null | undefined): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ENGINEER' || r === 'QUALITY_ENGINEER' || r === 'SUPERVISION_ENGINEER';
}

/** @deprecated Use isWorkspaceEngineerRole */
export const isQcPoolEngineerRole = isWorkspaceEngineerRole;

export type WorkspaceTechniqueRow = {
  slug: string;
  departmentId: string | null;
  active: boolean;
  category: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWorkspaceTechniqueRows(prisma: any, companyId: string): Promise<WorkspaceTechniqueRow[]> {
  try {
    const rows = await prisma.privateCompanyTechnique.findMany({
      where: { companyId, active: true },
      select: { slug: true, departmentId: true, active: true, category: true },
    });
    return (rows as Array<{ slug: string; departmentId: string | null; active: boolean; category?: string | null }>).map(
      (r) => ({
        slug: String(r.slug ?? '').trim().toLowerCase(),
        departmentId: r.departmentId ?? null,
        active: r.active !== false,
        category: r.category ?? null,
      }),
    );
  } catch {
    return [];
  }
}

const PC_DEPT_QC_PREFIX = 'pc_dept_qc_';
const PC_DEPT_M_PREFIX = 'pc_dept_m_';

/** Workspace tickets routed by department use synthetic slugs from [departmentQcTechniqueSlug]. */
export function departmentIdFromWorkspaceTechniqueSlug(technique: string): string | null {
  const t = technique.trim().toLowerCase();
  if (t.startsWith(PC_DEPT_QC_PREFIX)) return t.slice(PC_DEPT_QC_PREFIX.length) || null;
  if (t.startsWith(PC_DEPT_M_PREFIX)) return t.slice(PC_DEPT_M_PREFIX.length) || null;
  return null;
}

export function isDepartmentQcTechniqueSlug(technique: string): boolean {
  return technique.trim().toLowerCase().startsWith(PC_DEPT_QC_PREFIX);
}

export function isDepartmentMaintenanceTechniqueSlug(technique: string): boolean {
  return technique.trim().toLowerCase().startsWith(PC_DEPT_M_PREFIX);
}

function slugIsMaintenanceKind(technique: string, workspaceRows: WorkspaceTechniqueRow[]): boolean {
  const tech = technique.trim().toLowerCase();
  if (!tech) return false;
  if (MAINTENANCE_TECHNIQUES.includes(tech) || tech === 'maintenance') return true;
  if (isDepartmentMaintenanceTechniqueSlug(tech)) return true;
  const row = workspaceRows.find((r) => r.active && r.slug === tech);
  if (row?.category === 'MAINTENANCE') return true;
  return false;
}

function slugIsQcKind(technique: string, workspaceRows: WorkspaceTechniqueRow[]): boolean {
  const tech = technique.trim().toLowerCase();
  if (!tech) return false;
  if (isDepartmentQcTechniqueSlug(tech)) return true;
  const row = workspaceRows.find((r) => r.active && r.slug === tech);
  if (row?.category === 'INSPECTION_QC') return true;
  return !slugIsMaintenanceKind(tech, workspaceRows);
}

/**
 * When no active technique rows exist for the workspace, all configured staff
 * still receive notifications / list rows (backward compatible).
 */
export function staffTicketTechniqueAllowed(args: {
  technique: string;
  staffDepartmentId: string | null;
  staffAllowedSlugs: string[];
  workspaceRows: WorkspaceTechniqueRow[];
}): boolean {
  const tech = args.technique.trim().toLowerCase();
  if (!tech) return true;

  const deptFromSlug = departmentIdFromWorkspaceTechniqueSlug(tech);
  if (deptFromSlug) {
    const staffDept = args.staffDepartmentId?.trim() || '';
    return !!staffDept && staffDept === deptFromSlug;
  }

  const rows = args.workspaceRows.filter((r) => r.active && r.slug);
  if (rows.length === 0) return true;

  const deptId = args.staffDepartmentId;
  const matchesDeptOrGlobal = rows.some(
    (r) =>
      r.slug === tech &&
      (r.departmentId === null || deptId == null || deptId === '' || r.departmentId === deptId),
  );
  if (!matchesDeptOrGlobal) return false;

  const slugs = args.staffAllowedSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (slugs.length === 0) return true;
  return slugs.includes(tech);
}

/** Department has an active workspace technique row for QC or maintenance. */
export function departmentHasActiveTicketKind(
  workspaceRows: WorkspaceTechniqueRow[],
  departmentId: string,
  kind: 'INSPECTION_QC' | 'MAINTENANCE',
): boolean {
  const dept = departmentId.trim();
  if (!dept) return false;
  const qcSlug = `${PC_DEPT_QC_PREFIX}${dept}`;
  const mSlug = `${PC_DEPT_M_PREFIX}${dept}`;
  return workspaceRows.some(
    (r) =>
      r.active &&
      r.category === kind &&
      (r.departmentId === dept || r.slug === (kind === 'MAINTENANCE' ? mSlug : qcSlug)),
  );
}

/**
 * Whether an engineer may see / self-assign a workspace staff ticket (list + assign + detail).
 * Owners configure per-department techniques (QC vs maintenance) and dispatch mode.
 */
export function engineerWorkspaceTicketAccess(args: {
  technique: string;
  staffDepartmentId: string | null;
  staffAllowedSlugs: string[];
  workspaceRows: WorkspaceTechniqueRow[];
  targetDepartmentId: string | null;
  maintenanceDispatchMode: string | null | undefined;
  engineerAvailabilityPoolEnabled: boolean;
  engineerTicketScope: EngineerTicketScope;
  pendingUnassigned: boolean;
  involvesRequester: boolean;
}): boolean {
  if (args.involvesRequester) return true;

  if (
    !staffTicketTechniqueAllowed({
      technique: args.technique,
      staffDepartmentId: args.staffDepartmentId,
      staffAllowedSlugs: args.staffAllowedSlugs,
      workspaceRows: args.workspaceRows,
    })
  ) {
    return false;
  }

  const targetDept = args.targetDepartmentId?.trim() || '';
  const staffDept = args.staffDepartmentId?.trim() || '';
  if (targetDept && staffDept && targetDept !== staffDept) return false;

  const isMaint = slugIsMaintenanceKind(args.technique, args.workspaceRows);
  const isQc = slugIsQcKind(args.technique, args.workspaceRows);

  if (!args.pendingUnassigned) return true;

  if (isMaint) {
    if (!engineerScopeAllowsMaintenance(args.engineerTicketScope)) return false;
    const dispatch = normalizeMaintenanceDispatchMode(args.maintenanceDispatchMode);
    if (dispatch !== MAINTENANCE_DISPATCH_ENGINEER) return false;
    if (staffDept && targetDept && staffDept !== targetDept) return false;
    if (staffDept && !targetDept) {
      const deptFromSlug = departmentIdFromWorkspaceTechniqueSlug(args.technique);
      if (deptFromSlug && deptFromSlug !== staffDept) return false;
    }
    if (staffDept && !departmentHasActiveTicketKind(args.workspaceRows, staffDept, 'MAINTENANCE')) {
      return false;
    }
    return true;
  }

  if (isQc && !engineerScopeAllowsQc(args.engineerTicketScope)) return false;
  if (isQc && !args.engineerAvailabilityPoolEnabled) return false;
  if (staffDept && !departmentHasActiveTicketKind(args.workspaceRows, staffDept, 'INSPECTION_QC')) {
    const deptFromSlug = departmentIdFromWorkspaceTechniqueSlug(args.technique);
    if (deptFromSlug || targetDept) {
      return departmentHasActiveTicketKind(args.workspaceRows, staffDept, 'INSPECTION_QC');
    }
  }
  return true;
}

export type EngineerWorkspaceTicketRow = {
  technique: string | null;
  assignmentScope?: string | null;
  privateCompanyId?: string | null;
  privateCompanyTargetDepartmentId?: string | null;
  province?: string | null;
  status?: string | null;
  company: string | null;
};

/** Detail GET access for workspace engineers — aligned with GET /api/tickets list. */
export async function assertEngineerWorkspaceTicketDetailAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaAny: any,
  requesterId: string,
  workspaceId: string | null,
  row: EngineerWorkspaceTicketRow,
): Promise<boolean> {
  const scope = row.assignmentScope ?? null;
  const pcId = row.privateCompanyId ?? null;
  const isPrivateStaff = !!pcId && (scope === 'PRIVATE_COMPANY_STAFF' || scope === null);
  if (!isPrivateStaff) return true;
  if (!workspaceId || workspaceId !== pcId) return false;

  const { parseTicketCompanyJson, ticketFieldStaffInvolvesRequester, assignedStaffIdFromCompanyJson } =
    await import('@/lib/private-company-kpi');
  const parsed = parseTicketCompanyJson(row.company);
  if (ticketFieldStaffInvolvesRequester(parsed, requesterId)) return true;

  const meRow = await prismaAny.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      privateCompanyDepartmentId: true,
      privateCompanyAllowedTaskSlugs: true,
      privateCompanyEngineerTicketScope: true,
    },
  });
  const deptId = meRow?.privateCompanyDepartmentId ?? null;
  const allowedSlugs = Array.isArray(meRow?.privateCompanyAllowedTaskSlugs)
    ? meRow.privateCompanyAllowedTaskSlugs
    : [];

  const techRows = await fetchWorkspaceTechniqueRows(prismaAny, workspaceId);
  const targetDept = row.privateCompanyTargetDepartmentId ?? null;
  let maintDispatch: string | null = null;
  let engineerPoolOk = true;
  let deptEngineerScope = 'BOTH';
  if (deptId || targetDept) {
    const scopeDept = targetDept || deptId;
    const drow = await prismaAny.privateCompanyDepartment.findFirst({
      where: { id: scopeDept, companyId: pcId },
      select: {
        maintenanceDispatchMode: true,
        engineerAvailabilityPoolEnabled: true,
        engineerTicketScope: true,
      },
    });
    maintDispatch = drow?.maintenanceDispatchMode ?? null;
    deptEngineerScope = drow?.engineerTicketScope ?? 'BOTH';
    if (deptId && scopeDept === deptId) {
      engineerPoolOk = drow?.engineerAvailabilityPoolEnabled !== false;
    }
  }
  const { resolveEngineerTicketScope } = await import('@/lib/engineer-ticket-scope');
  const engineerTicketScope = resolveEngineerTicketScope(
    meRow?.privateCompanyEngineerTicketScope,
    deptEngineerScope,
  );

  const pendingUnassigned =
    String(row.status ?? '').toUpperCase() === 'PENDING' && !assignedStaffIdFromCompanyJson(parsed);

  return engineerWorkspaceTicketAccess({
    technique: row.technique ?? '',
    staffDepartmentId: deptId,
    staffAllowedSlugs: allowedSlugs,
    workspaceRows: techRows,
    targetDepartmentId: targetDept,
    maintenanceDispatchMode: maintDispatch,
    engineerAvailabilityPoolEnabled: engineerPoolOk,
    engineerTicketScope,
    pendingUnassigned,
    involvesRequester: false,
  });
}
