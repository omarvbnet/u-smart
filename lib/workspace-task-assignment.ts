/**
 * Workspace-scoped ticket visibility: techniques configured per department
 * (PrivateCompanyTechnique) plus optional per-staff slug allowlist.
 */

export type WorkspaceTechniqueRow = {
  slug: string;
  departmentId: string | null;
  active: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWorkspaceTechniqueRows(prisma: any, companyId: string): Promise<WorkspaceTechniqueRow[]> {
  try {
    const rows = await prisma.privateCompanyTechnique.findMany({
      where: { companyId, active: true },
      select: { slug: true, departmentId: true, active: true },
    });
    return (rows as Array<{ slug: string; departmentId: string | null; active: boolean }>).map((r) => ({
      slug: String(r.slug ?? '').trim().toLowerCase(),
      departmentId: r.departmentId ?? null,
      active: r.active !== false,
    }));
  } catch {
    return [];
  }
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
  const rows = args.workspaceRows.filter((r) => r.active && r.slug);
  if (rows.length === 0) return true;

  const deptId = args.staffDepartmentId;
  const matchesDeptOrGlobal = rows.some(
    (r) =>
      r.slug === tech &&
      (r.departmentId === null || deptId == null || deptId === '' || r.departmentId === deptId)
  );
  if (!matchesDeptOrGlobal) return false;

  const slugs = args.staffAllowedSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (slugs.length === 0) return true;
  return slugs.includes(tech);
}
