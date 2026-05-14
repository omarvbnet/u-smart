/**
 * Each workspace department is exposed as two ticket "techniques" (QC + maintenance)
 * so ticket creation and notifications route through PrivateCompanyTechnique + department.
 */

export function departmentQcTechniqueSlug(departmentId: string): string {
  return `pc_dept_qc_${departmentId.trim()}`;
}

export function departmentMaintenanceTechniqueSlug(departmentId: string): string {
  return `pc_dept_m_${departmentId.trim()}`;
}

type UpsertArgs = {
  companyId: string;
  departmentId: string;
  departmentName: string;
  sortOrder: number;
};

/** Create or update INSPECTION_QC + MAINTENANCE technique rows for one department. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertDepartmentTechniqueRows(prisma: any, args: UpsertArgs): Promise<void> {
  const delegate = prisma.privateCompanyTechnique;
  if (!delegate?.findFirst || !delegate.create || !delegate.update) return;

  const name = args.departmentName.trim() || 'Department';
  const labelAr = name;
  const labelEn = `Department: ${name}`;
  const qcSlug = departmentQcTechniqueSlug(args.departmentId);
  const mSlug = departmentMaintenanceTechniqueSlug(args.departmentId);
  const baseSort = Math.max(0, args.sortOrder) * 10;

  const upsertOne = async (category: 'INSPECTION_QC' | 'MAINTENANCE', slug: string, sortOrder: number) => {
    const existing = await delegate.findFirst({
      where: { companyId: args.companyId, category, slug },
      select: { id: true },
    });
    const data = {
      labelAr,
      labelEn,
      sortOrder,
      active: true,
      departmentId: args.departmentId,
    };
    if (existing?.id) {
      await delegate.update({ where: { id: existing.id }, data });
    } else {
      await delegate.create({
        data: {
          companyId: args.companyId,
          category,
          slug,
          labelAr,
          labelEn,
          sortOrder,
          active: true,
          departmentId: args.departmentId,
        },
      });
    }
  };

  await upsertOne('INSPECTION_QC', qcSlug, baseSort);
  await upsertOne('MAINTENANCE', mSlug, baseSort + 1);
}

/** Remove technique rows tied to a department (before deleting the department). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteDepartmentTechniqueRows(prisma: any, companyId: string, departmentId: string): Promise<void> {
  const delegate = prisma.privateCompanyTechnique;
  if (!delegate?.deleteMany) return;
  const qcSlug = departmentQcTechniqueSlug(departmentId);
  const mSlug = departmentMaintenanceTechniqueSlug(departmentId);
  await delegate.deleteMany({
    where: {
      companyId,
      OR: [{ slug: qcSlug }, { slug: mSlug }, { departmentId }],
    },
  });
}
