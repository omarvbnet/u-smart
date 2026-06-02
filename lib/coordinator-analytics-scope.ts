/**
 * Owner-controlled analytics/ticket visibility for COORDINATOR workspace staff.
 *
 * - DEPARTMENT (default): coordinator sees only their assigned department's
 *   tickets + analytics (same scope as a department MANAGER).
 * - COMPANY: coordinator sees the whole workspace's tickets + analytics
 *   (same scope as the workspace owner).
 *
 * Only the workspace owner can change this per coordinator.
 */

export const COORDINATOR_ANALYTICS_SCOPES = ['DEPARTMENT', 'COMPANY'] as const;
export type CoordinatorAnalyticsScope = (typeof COORDINATOR_ANALYTICS_SCOPES)[number];

export function normalizeCoordinatorAnalyticsScope(
  raw: unknown
): CoordinatorAnalyticsScope {
  const u = String(raw ?? '').trim().toUpperCase();
  return u === 'COMPANY' ? 'COMPANY' : 'DEPARTMENT';
}
