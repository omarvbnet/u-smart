/**
 * Per-department default + optional per-engineer override for which workspace
 * ticket kinds engineers may claim (QC inspection vs maintenance triage).
 */

export const ENGINEER_TICKET_SCOPES = ['QC_ONLY', 'MAINTENANCE_ONLY', 'BOTH'] as const;
export type EngineerTicketScope = (typeof ENGINEER_TICKET_SCOPES)[number];

export function normalizeEngineerTicketScope(raw: unknown): EngineerTicketScope {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  if (u === 'QC_ONLY' || u === 'QC') return 'QC_ONLY';
  if (u === 'MAINTENANCE_ONLY' || u === 'MAINTENANCE') return 'MAINTENANCE_ONLY';
  return 'BOTH';
}

export function resolveEngineerTicketScope(
  staffOverride: string | null | undefined,
  departmentDefault: string | null | undefined,
): EngineerTicketScope {
  if (staffOverride != null && String(staffOverride).trim()) {
    return normalizeEngineerTicketScope(staffOverride);
  }
  return normalizeEngineerTicketScope(departmentDefault);
}

export function engineerScopeAllowsQc(scope: EngineerTicketScope): boolean {
  return scope === 'QC_ONLY' || scope === 'BOTH';
}

export function engineerScopeAllowsMaintenance(scope: EngineerTicketScope): boolean {
  return scope === 'MAINTENANCE_ONLY' || scope === 'BOTH';
}
