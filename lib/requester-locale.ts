import type { AppNotificationLocale } from '@/lib/notification-i18n';
import { normalizeAppLocale } from '@/lib/notification-i18n';

export async function fetchPreferredLocales(
  prisma: { ticketRequester?: { findMany: (a: unknown) => Promise<unknown[]> }; coordinatorUser?: { findMany: (a: unknown) => Promise<unknown[]> } },
  requesterIds: string[]
): Promise<Map<string, AppNotificationLocale>> {
  const map = new Map<string, AppNotificationLocale>();
  if (!requesterIds.length) return map;
  const unique = [...new Set(requesterIds)];

  try {
    const rows = (await prisma.coordinatorUser?.findMany({
      where: { id: { in: unique } },
      select: { id: true, preferredLocale: true },
    })) as Array<{ id: string; preferredLocale: string | null }> | undefined;
    for (const r of rows ?? []) {
      map.set(r.id, normalizeAppLocale(r.preferredLocale));
    }
  } catch {
    /* ignore */
  }

  try {
    const rows2 = (await prisma.ticketRequester?.findMany({
      where: { id: { in: unique } },
      select: { id: true, preferredLocale: true },
    })) as Array<{ id: string; preferredLocale: string | null }> | undefined;
    for (const r of rows2 ?? []) {
      if (!map.has(r.id)) map.set(r.id, normalizeAppLocale(r.preferredLocale));
    }
  } catch {
    /* ignore */
  }

  for (const id of unique) {
    if (!map.has(id)) map.set(id, 'en');
  }
  return map;
}
