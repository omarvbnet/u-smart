import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const ACCOUNT_DELETION_GRACE_DAYS = 7;

export function accountDeletionGraceMs(): number {
  return ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export function scheduledDeletionAt(deletionRequestedAt: Date): Date {
  return new Date(deletionRequestedAt.getTime() + accountDeletionGraceMs());
}

export function isAccountDeletionGraceExpired(deletionRequestedAt: Date, now = new Date()): boolean {
  return now.getTime() >= scheduledDeletionAt(deletionRequestedAt).getTime();
}

/** Delete all requesters whose deletion grace period ended without a new login. */
export async function purgeExpiredAccountDeletions(): Promise<number> {
  const delegate = prisma.ticketRequester;
  if (!delegate?.findMany) return 0;

  const cutoff = new Date(Date.now() - accountDeletionGraceMs());
  const expired = await delegate.findMany({
    where: {
      deletionRequestedAt: { not: null, lte: cutoff },
    },
    select: { id: true },
  });

  let count = 0;
  for (const row of expired) {
    try {
      await permanentlyDeleteTicketRequester(row.id);
      count += 1;
    } catch (e) {
      console.error('purgeExpiredAccountDeletions:', row.id, e);
    }
  }
  return count;
}

export async function permanentlyDeleteTicketRequester(requesterId: string): Promise<void> {
  await prisma.ticketRequester.delete({ where: { id: requesterId } });
}

/**
 * On successful login: cancel pending deletion, or remove account if grace expired.
 * @returns `deleted` if account was purged; `ok` otherwise (including after cancel).
 */
export async function resolveDeletionOnLogin(
  requesterId: string
): Promise<'ok' | 'deleted'> {
  const row = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, deletionRequestedAt: true },
  });
  if (!row?.deletionRequestedAt) return 'ok';

  if (isAccountDeletionGraceExpired(row.deletionRequestedAt)) {
    await permanentlyDeleteTicketRequester(requesterId);
    return 'deleted';
  }

  await prisma.ticketRequester.update({
    where: { id: requesterId },
    data: { deletionRequestedAt: null },
  });
  return 'ok';
}

export async function scheduleTicketRequesterDeletion(
  requesterId: string
): Promise<{ scheduledDeletionAt: string }> {
  const now = new Date();
  await prisma.ticketRequester.update({
    where: { id: requesterId },
    data: {
      deletionRequestedAt: now,
      phonePushToken: null,
      phonePlatform: null,
    },
  });
  return { scheduledDeletionAt: scheduledDeletionAt(now).toISOString() };
}

/** Active session: user returned before grace ended — cancel scheduled deletion. */
export async function cancelScheduledDeletionIfPending(requesterId: string): Promise<void> {
  const row = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { deletionRequestedAt: true },
  });
  if (!row?.deletionRequestedAt) return;
  if (isAccountDeletionGraceExpired(row.deletionRequestedAt)) {
    await permanentlyDeleteTicketRequester(requesterId);
    return;
  }
  await prisma.ticketRequester.update({
    where: { id: requesterId },
    data: { deletionRequestedAt: null },
  });
}
