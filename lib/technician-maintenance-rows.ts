import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';
import { lookupProvisorTechniqueCategory } from '@/lib/provisor-technique-lookup';

const MAINT = new Set(MAINTENANCE_TECHNIQUES.map((s) => s.toLowerCase()));

/**
 * Keep only maintenance-style tickets for technician list/detail filtering.
 * Includes Provisor / workspace technique slugs not in the legacy five slugs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function filterRowsToMaintenanceTickets<T extends { technique: string | null }>(
  prisma: any,
  rows: T[],
  workspaceCompanyId: string | null
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const rawSlugs = [...new Set(rows.map((r) => String(r.technique ?? '').trim()).filter(Boolean))];
  const maintBySlug = new Map<string, boolean>();
  const unknown: string[] = [];
  for (const s of rawSlugs) {
    const lo = s.toLowerCase();
    if (MAINT.has(lo) || lo === 'maintenance') {
      maintBySlug.set(s, true);
    } else {
      maintBySlug.set(s, false);
      unknown.push(s);
    }
  }
  await Promise.all(
    unknown.map(async (s) => {
      const k = await lookupProvisorTechniqueCategory(prisma, s, { workspaceCompanyId: workspaceCompanyId });
      maintBySlug.set(s, k === 'MAINTENANCE');
    })
  );
  return rows.filter((r) => {
    const key = String(r.technique ?? '').trim();
    return maintBySlug.get(key) === true;
  });
}
