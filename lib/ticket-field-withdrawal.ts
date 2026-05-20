/**
 * Technician withdrawal from a workspace ticket (stored in VisitorRequest.company JSON).
 */

import { maintenanceCrewIdsFromCompanyJson, parseTicketCompanyJson } from '@/lib/private-company-kpi';

export type TicketWithdrawalRequest = {
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  reason?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  role: 'LEAD' | 'CREW';
  resolvedBy?: string;
  resolvedAt?: string;
};

const KEY = 'withdrawalRequest';

export function readWithdrawalRequest(companyJson: string | null): TicketWithdrawalRequest | null {
  const parsed = parseTicketCompanyJson(companyJson);
  const raw = parsed[KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const requestedBy = typeof o.requestedBy === 'string' ? o.requestedBy.trim() : '';
  if (!requestedBy) return null;
  const status = String(o.status ?? 'PENDING').toUpperCase();
  const role = String(o.role ?? 'LEAD').toUpperCase() === 'CREW' ? 'CREW' : 'LEAD';
  return {
    requestedBy,
    requestedByName: typeof o.requestedByName === 'string' ? o.requestedByName : undefined,
    requestedAt: typeof o.requestedAt === 'string' ? o.requestedAt : new Date().toISOString(),
    reason: typeof o.reason === 'string' ? o.reason : undefined,
    status:
      status === 'ACCEPTED' || status === 'REJECTED' ? (status as 'ACCEPTED' | 'REJECTED') : 'PENDING',
    role,
    resolvedBy: typeof o.resolvedBy === 'string' ? o.resolvedBy : undefined,
    resolvedAt: typeof o.resolvedAt === 'string' ? o.resolvedAt : undefined,
  };
}

export function writeWithdrawalRequest(
  parsed: Record<string, unknown>,
  req: TicketWithdrawalRequest | null
): void {
  if (!req) {
    delete parsed[KEY];
    return;
  }
  parsed[KEY] = req;
}

export function withdrawalRequesterRole(
  requesterId: string,
  companyJson: string | null
): 'LEAD' | 'CREW' | null {
  const parsed = parseTicketCompanyJson(companyJson);
  const lead =
    typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId.trim() : '';
  if (lead && lead === requesterId) return 'LEAD';
  const crew = maintenanceCrewIdsFromCompanyJson(parsed);
  if (crew.includes(requesterId)) return 'CREW';
  return null;
}
