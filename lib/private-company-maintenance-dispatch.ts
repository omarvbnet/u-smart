/** Workspace maintenance routing for a department (owner-configured). */
export const MAINTENANCE_DISPATCH_DIRECT = 'DIRECT_TECHNICIAN';
export const MAINTENANCE_DISPATCH_ENGINEER = 'ENGINEER_ASSIGNS';

export function normalizeMaintenanceDispatchMode(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (s === MAINTENANCE_DISPATCH_ENGINEER) return MAINTENANCE_DISPATCH_ENGINEER;
  return MAINTENANCE_DISPATCH_DIRECT;
}
