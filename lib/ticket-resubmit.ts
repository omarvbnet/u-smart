/**
 * Ticket resubmit workflow: field staff → requester (edit) → back to staff.
 * Timing stored in company JSON for workspace KPI rollups.
 */

export const RESUBMIT_TARGET_REQUESTER = 'REQUESTER';
export const RESUBMIT_TARGET_STAFF = 'STAFF';
export const RESUBMIT_TARGET_COORDINATOR = 'COORDINATOR';

export type ResubmissionCycle = {
  staffSubmittedAt: string;
  requesterReturnedAt?: string;
  reason: string;
  hours?: number;
  byUserId: string;
  byRole: string;
};

export function readResubmitMeta(parsed: Record<string, unknown>) {
  const target = parsed.resubmitTarget;
  const resubmitTarget =
    target === RESUBMIT_TARGET_REQUESTER ||
    target === RESUBMIT_TARGET_STAFF ||
    target === RESUBMIT_TARGET_COORDINATOR
      ? target
      : null;
  return {
    resubmitTarget,
    resubmitPendingAt:
      typeof parsed.resubmitPendingAt === 'string' ? parsed.resubmitPendingAt : null,
    resubmissionCycles: parseResubmissionCycles(parsed),
  };
}

export function parseResubmissionCycles(parsed: Record<string, unknown>): ResubmissionCycle[] {
  const raw = parsed.resubmissionCycles;
  if (!Array.isArray(raw)) return [];
  const out: ResubmissionCycle[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const staffSubmittedAt =
      typeof o.staffSubmittedAt === 'string' ? o.staffSubmittedAt : '';
    const reason = typeof o.reason === 'string' ? o.reason : '';
    const byUserId = typeof o.byUserId === 'string' ? o.byUserId : '';
    const byRole = typeof o.byRole === 'string' ? o.byRole : '';
    if (!staffSubmittedAt || !reason) continue;
    const cycle: ResubmissionCycle = {
      staffSubmittedAt,
      reason,
      byUserId,
      byRole,
    };
    if (typeof o.requesterReturnedAt === 'string') {
      cycle.requesterReturnedAt = o.requesterReturnedAt;
    }
    if (typeof o.hours === 'number' && Number.isFinite(o.hours)) {
      cycle.hours = o.hours;
    }
    out.push(cycle);
  }
  return out;
}

export function resubmissionHoursBetween(startIso: string, endIso: string): number {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(((b - a) / 36e5) * 100) / 100;
}

export function totalResubmissionHoursFromParsed(parsed: Record<string, unknown>): number {
  const cycles = parseResubmissionCycles(parsed);
  let sum = 0;
  for (const c of cycles) {
    if (c.hours != null && c.hours >= 0) sum += c.hours;
    else if (c.requesterReturnedAt) {
      sum += resubmissionHoursBetween(c.staffSubmittedAt, c.requesterReturnedAt);
    }
  }
  const pendingAt =
    typeof parsed.resubmitPendingAt === 'string' ? parsed.resubmitPendingAt : null;
  if (pendingAt && parsed.workflowState === 'RESUBMITTED') {
    sum += resubmissionHoursBetween(pendingAt, new Date().toISOString());
  }
  return Math.round(sum * 100) / 100;
}

export function ticketResubmissionHoursForKpi(parsed: Record<string, unknown>): number | null {
  const total = totalResubmissionHoursFromParsed(parsed);
  if (total <= 0) {
    const cycles = parseResubmissionCycles(parsed);
    if (cycles.length === 0 && !parsed.resubmitPendingAt) return null;
  }
  return total > 0 ? total : null;
}

export function isTicketCompletedForResubmit(
  status: string | null | undefined,
  workflowState: string | null | undefined
): boolean {
  const s = String(status ?? '').toUpperCase();
  const w = String(workflowState ?? '').toUpperCase();
  return s === 'COMPLETED' || s === 'CANCELLED' || w === 'DONE';
}
