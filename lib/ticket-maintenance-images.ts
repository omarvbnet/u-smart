/** Resolve maintenance before/after URLs from DB columns with company JSON fallback. */

export function normalizeTicketImageUrlList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

export function resolveMaintenanceImageUrlsFromTicketRow(row: {
  beforeImageUrls?: unknown;
  finishingImageUrls?: unknown;
  company?: string | null;
}): { beforeImageUrls: string[]; finishingImageUrls: string[] } {
  let beforeImageUrls = normalizeTicketImageUrlList(row.beforeImageUrls);
  let finishingImageUrls = normalizeTicketImageUrlList(row.finishingImageUrls);
  if (beforeImageUrls.length > 0 && finishingImageUrls.length > 0) {
    return { beforeImageUrls, finishingImageUrls };
  }
  try {
    const parsed =
      typeof row.company === 'string' && row.company.trim()
        ? (JSON.parse(row.company) as Record<string, unknown>)
        : {};
    if (beforeImageUrls.length === 0) {
      beforeImageUrls = normalizeTicketImageUrlList(parsed.beforeImageUrls);
    }
    if (finishingImageUrls.length === 0) {
      finishingImageUrls = normalizeTicketImageUrlList(parsed.finishingImageUrls);
    }
  } catch {
    /* ignore */
  }
  return { beforeImageUrls, finishingImageUrls };
}
