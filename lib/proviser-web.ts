export const PROVISER_SERVICE_SLUG = 'quality-control-supervision';

export const ENGINEER_ROLES = new Set(['ENGINEER', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER']);

export type ProviserUser = {
  id: string;
  username: string;
  name: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string;
  serviceSlug?: string;
  status?: string;
  preferredLocale?: string | null;
};

export function isEngineerRole(role?: string | null): boolean {
  return !!role && ENGINEER_ROLES.has(role);
}

export function proviserHomePath(role?: string | null): string {
  return isEngineerRole(role) ? '/proviser/engineer' : '/proviser/company';
}

export function canAccessProviserWeb(user: ProviserUser | null): boolean {
  if (!user) return false;
  const slug = user.serviceSlug ?? PROVISER_SERVICE_SLUG;
  if (slug === PROVISER_SERVICE_SLUG) return true;
  // Coordinator / workspace users use QC service slug from requester-me
  return user.role != null && user.role !== 'REQUESTER';
}
