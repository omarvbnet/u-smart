import { prisma } from '@/lib/prisma';

/** Cached after first call (process lifetime). */
let coordinatorCompanyIdColumnKnown: boolean | null = null;

/** Prisma may report `visitor_requests.coordinatorCompanyId` in meta.column or nested fields. */
export function isMissingVisitorRequestsCoordinatorCompanyIdColumn(err: unknown): boolean {
  const e = err as {
    code?: string;
    message?: string;
    meta?: { column?: string } & Record<string, unknown>;
  };
  if (e?.code !== 'P2022') return false;
  const needle = 'coordinatorCompanyId';
  const metaCol = typeof e.meta?.column === 'string' ? e.meta.column : '';
  if (metaCol.includes(needle)) return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  return msg.includes('coordinatorCompanyId');
}

/** Call when Prisma proves the column is missing so we stop trusting a bad cache. */
export function invalidateVisitorRequestsCoordinatorCompanyIdCache(): void {
  coordinatorCompanyIdColumnKnown = null;
}

/**
 * Best-effort: whether `public.visitor_requests.coordinatorCompanyId` exists.
 * Falls back safely when wrong (prefer try/catch on actual Prisma queries).
 */
export async function visitorRequestsHasCoordinatorCompanyIdColumn(): Promise<boolean> {
  if (coordinatorCompanyIdColumnKnown !== null) {
    return coordinatorCompanyIdColumnKnown;
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'visitor_requests'
          AND column_name = 'coordinatorCompanyId'
      ) AS "exists"
    `;
    coordinatorCompanyIdColumnKnown = Boolean(rows[0]?.exists);
  } catch {
    coordinatorCompanyIdColumnKnown = false;
  }
  return coordinatorCompanyIdColumnKnown;
}
