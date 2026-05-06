/**
 * Map visitor_request.company JSON rows to API conflict payloads (QC + maintenance).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VisitorRowForConflict = any;

export const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'] as const;
export const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

export function rowToConflictPayload(row: VisitorRowForConflict): Record<string, unknown> | null {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    return null;
  }
  if (parsed.conflictReported !== true) return null;
  const technique = (row.technique ?? '').toLowerCase();
  const isMaintenance = MAINTENANCE_TECHNIQUES.includes(technique);
  const inspectionResult = isMaintenance
    ? 'maintenance'
    : ((parsed.inspectionResult as string) ?? 'not_accepted');
  if (!isMaintenance && !CONFLICT_RESULTS.includes(inspectionResult.toLowerCase())) return null;

  const out: Record<string, unknown> = {
    id: row.id,
    ticketId: row.id,
    siteName: parsed.siteName ?? null,
    siteCoordinator: parsed.siteCoordinator ?? null,
    assignedEngineerId: parsed.assignedEngineerId ?? null,
    assignedEngineerName: parsed.assignedEngineerName ?? null,
    inspectionResult,
    inspectionComments: parsed.inspectionComments ?? null,
    ncrReason: parsed.ncrReason ?? null,
    inspectionChecklist: Array.isArray(parsed.inspectionChecklist)
      ? parsed.inspectionChecklist
      : null,
    status: (parsed.conflictStatus as string) ?? 'pending',
    resolvedBy: parsed.conflictResolvedBy ?? null,
    resolvedAt: parsed.conflictResolvedAt ?? null,
    resolution: parsed.conflictResolution ?? null,
    resolutionComment: parsed.conflictResolutionComment ?? null,
    conflictReportComment: parsed.conflictReportComment ?? null,
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
    isMaintenanceConflict: isMaintenance,
    serviceSlug: row.serviceSlug ?? null,
    updatedAt: row.updatedAt ?? null,
  };
  if (isMaintenance && Array.isArray(parsed.conflictImageUrls)) {
    out.conflictImageUrls = (parsed.conflictImageUrls as unknown[]).filter((u) => typeof u === 'string');
  }
  return out;
}
