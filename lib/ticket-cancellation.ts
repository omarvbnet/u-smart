/**
 * Ticket cancellation requests: requester may ask while PENDING (assigned or not);
 * staff on the ticket approve (CANCELLED) or reject the request once field work started.
 */

import { assignedStaffIdFromCompanyJson, maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';

export const CANCELLATION_REQUEST_STATUS_KEY = 'cancellationRequestStatus';
export const CANCELLATION_REQUESTED_AT_KEY = 'cancellationRequestedAt';
export const CANCELLATION_REASON_KEY = 'cancellationReason';
export const CANCELLATION_REJECTED_AT_KEY = 'cancellationRejectedAt';
export const CANCELLATION_REJECTION_REASON_KEY = 'cancellationRejectionReason';

const BLOCKED_STATUSES = new Set(['ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export type CancellationRequestStatus = 'PENDING' | 'REJECTED';

export function readCancellationFromParsed(parsed: Record<string, unknown>) {
  const status = parsed[CANCELLATION_REQUEST_STATUS_KEY];
  const requestStatus =
    status === 'PENDING' || status === 'REJECTED' ? (status as CancellationRequestStatus) : null;
  return {
    cancellationRequestStatus: requestStatus,
    cancellationRequestedAt:
      typeof parsed[CANCELLATION_REQUESTED_AT_KEY] === 'string'
        ? parsed[CANCELLATION_REQUESTED_AT_KEY]
        : null,
    cancellationReason:
      typeof parsed[CANCELLATION_REASON_KEY] === 'string' ? parsed[CANCELLATION_REASON_KEY] : null,
    cancellationRejectedAt:
      typeof parsed[CANCELLATION_REJECTED_AT_KEY] === 'string'
        ? parsed[CANCELLATION_REJECTED_AT_KEY]
        : null,
    cancellationRejectionReason:
      typeof parsed[CANCELLATION_REJECTION_REASON_KEY] === 'string'
        ? parsed[CANCELLATION_REJECTION_REASON_KEY]
        : null,
  };
}

/** Requester may submit when ticket is still PENDING (pool or assigned, not yet on site). */
export function canRequesterRequestCancellation(rowStatus: string | null | undefined): boolean {
  return String(rowStatus ?? '').toUpperCase() === 'PENDING';
}

export function hasPendingCancellationRequest(parsed: Record<string, unknown>): boolean {
  return parsed[CANCELLATION_REQUEST_STATUS_KEY] === 'PENDING';
}

export function ticketFieldStaffIds(parsed: Record<string, unknown>): string[] {
  const lead = assignedStaffIdFromCompanyJson(parsed);
  const crew = maintenanceCrewIdsFromCompanyJson(parsed);
  const ids = new Set<string>();
  if (lead) ids.add(lead);
  for (const c of crew) ids.add(c);
  return [...ids];
}

export function isAssignedFieldStaff(parsed: Record<string, unknown>, requesterId: string): boolean {
  return ticketFieldStaffIds(parsed).includes(requesterId);
}

export function assertNotBlockedForCancellation(status: string | null | undefined): {
  ok: boolean;
  message?: string;
} {
  const s = String(status ?? '').toUpperCase();
  if (s === 'ON_SITE') {
    return {
      ok: false,
      message:
        'Cancellation cannot be requested while staff are on site. Ask them to reject the request or complete the ticket.',
    };
  }
  if (s === 'IN_PROGRESS') {
    return {
      ok: false,
      message: 'Cancellation cannot be requested while work is in progress.',
    };
  }
  if (s === 'COMPLETED') {
    return { ok: false, message: 'This ticket is already completed.' };
  }
  if (s === 'CANCELLED') {
    return { ok: false, message: 'This ticket is already cancelled.' };
  }
  if (BLOCKED_STATUSES.has(s) && s !== 'PENDING') {
    return { ok: false, message: `Cancellation is not allowed when status is ${s}.` };
  }
  return { ok: true };
}
