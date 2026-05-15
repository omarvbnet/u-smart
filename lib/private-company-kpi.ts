/**
 * KPI helpers for private-company workspace tickets (assignmentScope PRIVATE_COMPANY_STAFF).
 * Uses VisitorRequest.company JSON for assignee + TicketStatusLog for ON_SITE / IN_PROGRESS timing.
 */

export type TicketLogRow = { status: string; createdAt: Date };

export function parseTicketCompanyJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function assignedStaffIdFromCompanyJson(parsed: Record<string, unknown>): string | null {
  const id = parsed.assignedEngineerId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** Additional maintenance technicians on the same ticket (requester ids). */
export function maintenanceCrewIdsFromCompanyJson(parsed: Record<string, unknown>): string[] {
  const raw = parsed.maintenanceCrewIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim());
}

export function ticketFieldStaffInvolvesRequester(
  parsed: Record<string, unknown>,
  requesterId: string
): boolean {
  if (!requesterId) return false;
  if (assignedStaffIdFromCompanyJson(parsed) === requesterId) return true;
  return maintenanceCrewIdsFromCompanyJson(parsed).includes(requesterId);
}

/** Earliest time the ticket entered active field work (ON_SITE or IN_PROGRESS). */
export function firstActiveWorkAt(logs: TicketLogRow[]): Date | null {
  const active = new Set(['ON_SITE', 'IN_PROGRESS']);
  let best: Date | null = null;
  const sorted = [...logs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const l of sorted) {
    if (active.has(String(l.status).toUpperCase())) {
      if (best == null || l.createdAt.getTime() < best.getTime()) best = l.createdAt;
    }
  }
  return best;
}

/** Hours from ticket creation until first active work (site arrival / response). */
export function siteArrivalHours(createdAt: Date, logs: TicketLogRow[]): number | null {
  const work = firstActiveWorkAt(logs);
  if (!work) return null;
  return (work.getTime() - createdAt.getTime()) / 36e5;
}

/** Hours from first active work until completion (COMPLETED only). */
export function taskDurationHours(
  status: string,
  completedAt: Date | null,
  logs: TicketLogRow[]
): number | null {
  if (String(status).toUpperCase() !== 'COMPLETED' || !completedAt) return null;
  const work = firstActiveWorkAt(logs);
  if (!work) return null;
  return (completedAt.getTime() - work.getTime()) / 36e5;
}

export { ticketResubmissionHoursForKpi } from '@/lib/ticket-resubmit';
