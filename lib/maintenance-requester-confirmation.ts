/**
 * Maintenance tickets with a ticket requester: field team submits completion for
 * requester confirmation before the ticket is marked COMPLETED. Auto-confirms
 * after {@link MAINTENANCE_REQUESTER_CONFIRM_MINUTES} if the requester does nothing.
 */

import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

export const MAINTENANCE_REQUESTER_CONFIRM_MINUTES = 40;
export const MAINTENANCE_AWAITING_SINCE_KEY = 'maintenanceAwaitingRequesterSince';
export const MAINTENANCE_REJECT_REASON_KEY = 'maintenanceRequesterRejectReason';

const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

export function isMaintenanceTechnique(technique: string | null | undefined): boolean {
  return MAINTENANCE_TECHNIQUES.includes(String(technique ?? '').toLowerCase());
}

export function readMaintenanceAwaitingSince(parsed: Record<string, unknown>): string | null {
  const v = parsed[MAINTENANCE_AWAITING_SINCE_KEY];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function readMaintenanceRejectReason(parsed: Record<string, unknown>): string | null {
  const v = parsed[MAINTENANCE_REJECT_REASON_KEY];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function maintenanceAwaitingExpired(awaitingSinceIso: string, nowMs: number): boolean {
  const t = Date.parse(awaitingSinceIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t >= MAINTENANCE_REQUESTER_CONFIRM_MINUTES * 60 * 1000;
}

/** Parsed JSON status from company payload (falls back to DB status caller passes). */
export function readTicketJsonStatus(parsed: Record<string, unknown>, dbStatus: string): string {
  const s = parsed.status;
  if (typeof s === 'string' && s.trim()) return s.trim().toUpperCase();
  return String(dbStatus ?? 'PENDING').toUpperCase();
}

export async function finalizeMaintenanceAsCompleted(
  prisma: any,
  ticket: {
    id: string;
    company: string | null;
    requesterId: string | null;
    beforeImageUrls?: unknown;
    finishingImageUrls?: unknown;
  }
): Promise<void> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }
  if (!parsed._ticket) parsed._ticket = true;
  parsed.status = 'COMPLETED';
  parsed.completedAt = new Date().toISOString();
  parsed.workflowState = 'DONE';
  delete parsed[MAINTENANCE_AWAITING_SINCE_KEY];
  delete parsed[MAINTENANCE_REJECT_REASON_KEY];

  await prisma.visitorRequest.update({
    where: { id: ticket.id },
    data: {
      status: 'COMPLETED',
      workflowState: 'DONE',
      completedAt: new Date(),
      company: JSON.stringify(parsed),
    },
  });
  try {
    await prisma.ticketStatusLog.create({
      data: { visitorRequestId: ticket.id, status: 'COMPLETED' },
    });
  } catch {
    /* ignore */
  }
  if (ticket.requesterId) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId: ticket.id,
        requesterId: ticket.requesterId,
        payload: {
          key: 'ticket_completed',
          vars: { resultKey: '' },
        },
        data: { ticketId: ticket.id, type: 'status_changed' },
      });
    } catch {
      /* ignore */
    }
  }
}

/**
 * If this ticket is maintenance, awaiting requester confirm, and the deadline passed,
 * marks it completed. Returns true if an update was applied.
 */
export async function tryAutoConfirmExpiredMaintenanceAwaiting(prisma: any, ticketId: string): Promise<boolean> {
  const row = await prisma.visitorRequest.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      company: true,
      status: true,
      technique: true,
      requesterId: true,
      beforeImageUrls: true,
      finishingImageUrls: true,
    },
  });
  if (!row || !row.requesterId) return false;
  if (!isMaintenanceTechnique(row.technique)) return false;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    parsed = {};
  }
  const awaiting = readMaintenanceAwaitingSince(parsed);
  if (!awaiting) return false;
  const st = readTicketJsonStatus(parsed, row.status);
  if (st === 'COMPLETED') return false;
  if (!maintenanceAwaitingExpired(awaiting, Date.now())) return false;

  await finalizeMaintenanceAsCompleted(prisma, row);
  return true;
}
