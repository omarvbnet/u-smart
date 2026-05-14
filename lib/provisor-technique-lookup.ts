/**
 * Resolve Provisor / workspace technique slug to category (QC vs maintenance).
 * Shared with ticket POST and GET detail so custom workspace slugs stay consistent.
 */

type ProvisorTechniqueCategory = 'INSPECTION_QC' | 'MAINTENANCE';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lookupProvisorTechniqueCategory(
  prisma: any,
  slug: string,
  opts?: { workspaceCompanyId: string | null }
): Promise<ProvisorTechniqueCategory | null> {
  const s = typeof slug === 'string' ? slug.trim() : '';
  if (!s) return null;
  if (opts?.workspaceCompanyId) {
    try {
      const delegate = prisma.privateCompanyTechnique;
      if (delegate?.findFirst) {
        const w = await delegate.findFirst({
          where: { companyId: opts.workspaceCompanyId, slug: s, active: true },
          select: { category: true },
        });
        const wc = w?.category as string | undefined;
        if (wc === 'INSPECTION_QC' || wc === 'MAINTENANCE') return wc;
      }
    } catch {
      /* table missing */
    }
  }
  try {
    const delegate = prisma.provisorTechnique;
    if (!delegate?.findFirst) return null;
    const row = await delegate.findFirst({
      where: { slug: s, active: true },
      select: { category: true },
    });
    const c = row?.category as string | undefined;
    if (c === 'INSPECTION_QC' || c === 'MAINTENANCE') return c;
  } catch {
    /* table missing or query error */
  }
  return null;
}
