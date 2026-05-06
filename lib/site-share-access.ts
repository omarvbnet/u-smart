/**
 * Helpers for granting site readers access to owner's tickets scoped by site's logical identifier (Site.siteId).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaCompat = any;

export type SharedSiteTicketClause = {
  requesterId: string;
  siteName: string;
  serviceSlug: string;
};

export async function getSharedSiteTicketOrClauses(
  prisma: PrismaCompat,
  recipientRequesterId: string,
  filterServiceSlug: string
): Promise<SharedSiteTicketClause[]> {
  try {
    const rows = await prisma.siteShare.findMany({
      where: { sharedWithRequesterId: recipientRequesterId, includeTickets: true },
      select: { site: { select: { requesterId: true, siteId: true } } },
    });
    return rows.map((r: { site: { requesterId: string; siteId: string } }) => ({
      requesterId: r.site.requesterId,
      siteName: r.site.siteId,
      serviceSlug: filterServiceSlug,
    }));
  } catch {
    return [];
  }
}

/** Mutates `where` to include OR branches for tickets on sites shared with this requester. */
export async function applySharedSiteTicketsToVisitorWhere(
  prisma: PrismaCompat,
  recipientRequesterId: string,
  filterServiceSlug: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  where: any
): Promise<void> {
  const shared = await getSharedSiteTicketOrClauses(prisma, recipientRequesterId, filterServiceSlug);
  if (shared.length === 0) return;

  if (where.OR && Array.isArray(where.OR)) {
    where.OR = [...where.OR, ...shared];
    return;
  }

  if (where.requesterId && where.serviceSlug) {
    const rid = where.requesterId;
    const slug = where.serviceSlug;
    delete where.requesterId;
    where.OR = [{ requesterId: rid, serviceSlug: slug }, ...shared];
  }
}

export function visitorRequestSiteLogicalId(row: {
  siteName?: string | null;
  company?: string | null;
}): string | null {
  if (row.siteName != null && String(row.siteName).trim()) return String(row.siteName).trim();
  try {
    const parsed =
      typeof row.company === 'string' ? JSON.parse(row.company) : ({} as Record<string, unknown>);
    const stub = parsed?._ticket as Record<string, unknown> | undefined;
    const sn = stub?.siteName;
    return typeof sn === 'string' && sn.trim() ? sn.trim() : null;
  } catch {
    return null;
  }
}

export async function viewerHasSharedSiteTicketRead(
  prisma: PrismaCompat,
  viewerRequesterId: string,
  ticket: { requesterId: string | null; siteName: string | null }
): Promise<boolean> {
  const ownerId = ticket.requesterId;
  const siteLogical = ticket.siteName;
  if (!ownerId || !siteLogical) return false;
  try {
    const n = await prisma.siteShare.count({
      where: {
        sharedWithRequesterId: viewerRequesterId,
        includeTickets: true,
        site: { requesterId: ownerId, siteId: siteLogical },
      },
    });
    return n > 0;
  } catch {
    return false;
  }
}
