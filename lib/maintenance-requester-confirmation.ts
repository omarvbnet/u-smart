/**
 * Maintenance tickets with a ticket requester: field team submits completion for
 * requester confirmation before the ticket is marked COMPLETED. Auto-confirms
 * after {@link MAINTENANCE_REQUESTER_CONFIRM_MINUTES} if the requester does nothing.
 */

import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';
import { lookupProvisorTechniqueCategory } from '@/lib/provisor-technique-lookup';

export const MAINTENANCE_REQUESTER_CONFIRM_MINUTES = 40;
export const MAINTENANCE_AWAITING_SINCE_KEY = 'maintenanceAwaitingRequesterSince';
export const MAINTENANCE_REJECT_REASON_KEY = 'maintenanceRequesterRejectReason';
/** Set when the requester confirms (or auto-confirms) maintenance completion — shown on ticket timeline. */
export const MAINTENANCE_REQUESTER_CONFIRMED_AT_KEY = 'maintenanceRequesterConfirmedAt';

export function isMaintenanceTechnique(technique: string | null | undefined): boolean {
  const lo = String(technique ?? '').trim().toLowerCase();
  if (!lo) return false;
  return MAINTENANCE_TECHNIQUES.includes(lo) || lo === 'maintenance';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveIsMaintenanceVisitorRequest(
  prisma: any,
  technique: string | null | undefined,
  privateCompanyId: string | null | undefined
): Promise<boolean> {
  if (isMaintenanceTechnique(technique)) return true;
  const slug = String(technique ?? '').trim();
  if (!slug) return false;
  const kind = await lookupProvisorTechniqueCategory(prisma, slug, {
    workspaceCompanyId: privateCompanyId ?? null,
  });
  return kind === 'MAINTENANCE';
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
  const nowIso = new Date().toISOString();
  parsed[MAINTENANCE_REQUESTER_CONFIRMED_AT_KEY] = nowIso;
  parsed.status = 'COMPLETED';
  parsed.completedAt = nowIso;
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
      privateCompanyId: true,
      beforeImageUrls: true,
      finishingImageUrls: true,
    },
  });
  if (!row || !row.requesterId) return false;
  if (!(await resolveIsMaintenanceVisitorRequest(prisma, row.technique, row.privateCompanyId))) return false;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sweepExpiredMaintenanceAwaitingConfirmations(prisma: any): Promise<{
  scanned: number;
  completed: number;
}> {
  const candidates = await prisma.visitorRequest.findMany({
    where: {
      requesterId: { not: null },
      status: { not: 'COMPLETED' },
      company: { contains: MAINTENANCE_AWAITING_SINCE_KEY },
    },
    select: { id: true },
    take: 500,
  });
  let completed = 0;
  for (const c of candidates) {
    if (await tryAutoConfirmExpiredMaintenanceAwaiting(prisma, c.id)) completed += 1;
  }
  return { scanned: candidates.length, completed };
}
