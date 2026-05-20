import type { Prisma } from '@prisma/client';
import { prisma as _prisma } from '@/lib/prisma';
import { DEFAULT_MAINTENANCE_SLUGS } from '@/lib/provisor-technique-defaults';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const PC_DEPT_M_PREFIX = 'pc_dept_m_';

export function techniqueIsMaintenance(
  technique: string | null | undefined,
  maintenanceSlugs: string[]
): boolean {
  const t = String(technique ?? '').trim().toLowerCase();
  if (!t) return false;
  if (t === 'maintenance') return true;
  if (t.startsWith(PC_DEPT_M_PREFIX)) return true;
  return maintenanceSlugs.some((s) => s.toLowerCase() === t);
}

export function maintenanceTechniqueWhere(
  maintenanceSlugs: string[]
): Prisma.VisitorRequestWhereInput {
  return {
    OR: [
      { technique: { in: maintenanceSlugs } },
      { technique: { startsWith: PC_DEPT_M_PREFIX, mode: 'insensitive' } },
      { technique: { equals: 'maintenance', mode: 'insensitive' } },
    ],
  };
}

export function inspectionTechniqueWhere(
  maintenanceSlugs: string[]
): Prisma.VisitorRequestWhereInput {
  return {
    AND: [
      { technique: { notIn: maintenanceSlugs } },
      { NOT: { technique: { startsWith: PC_DEPT_M_PREFIX, mode: 'insensitive' } } },
      { NOT: { technique: { equals: 'maintenance', mode: 'insensitive' } } },
    ],
  };
}

/** Global + optional workspace maintenance slugs for ticket counts. */
export async function getMaintenanceSlugs(companyId?: string | null): Promise<string[]> {
  const slugs = new Set<string>([...DEFAULT_MAINTENANCE_SLUGS, 'maintenance']);
  try {
    const rows = (await prisma.provisorTechnique.findMany({
      where: { category: 'MAINTENANCE', active: true },
      select: { slug: true },
    })) as { slug: string }[];
    for (const r of rows) slugs.add(r.slug);
  } catch {
    /* table missing pre-migration */
  }
  const cid = companyId?.trim();
  if (cid) {
    try {
      const delegate = prisma.privateCompanyTechnique;
      if (delegate?.findMany) {
        const wsRows = (await delegate.findMany({
          where: { companyId: cid, category: 'MAINTENANCE', active: true },
          select: { slug: true },
        })) as { slug: string }[];
        for (const r of wsRows) slugs.add(r.slug);
      }
    } catch {
      /* pre-migration */
    }
  }
  return [...slugs];
}

export async function sumCompletedHours(
  where: Prisma.VisitorRequestWhereInput
): Promise<number> {
  const rows = await prisma.visitorRequest.findMany({
    where: {
      ...where,
      status: 'COMPLETED',
      completedAt: { not: null },
    },
    select: { createdAt: true, completedAt: true },
  });
  let sum = 0;
  for (const r of rows) {
    if (r.completedAt) {
      sum += (r.completedAt.getTime() - r.createdAt.getTime()) / 3600000;
    }
  }
  return Math.round(sum * 10) / 10;
}
