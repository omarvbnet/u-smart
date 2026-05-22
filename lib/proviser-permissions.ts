import type { ProviserUser } from '@/lib/proviser-web';

export type ProviserWorkspaceMode = 'private' | 'coordinator' | 'none';

export type ProviserMembership = {
  mode: ProviserWorkspaceMode;
  isOwner: boolean;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  workspaceStatus: string | null;
  canManageDepartments: boolean;
  canManageStaff: boolean;
  canViewPerformance: boolean;
  performanceScope: 'workspace' | 'department' | null;
  /** Owner / coordinator owner: full company data */
  canViewCompanyWide: boolean;
  /** Manager / coordinator with department: scoped data only */
  isDepartmentScoped: boolean;
  scopeDepartmentId: string | null;
};

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);
const COORDINATOR_OWNER_ROLES = new Set(['COMPANY_OWNER', 'ADMIN', 'COMPANY']);
const COORDINATOR_STAFF_MANAGER_ROLES = new Set([
  'COMPANY_OWNER',
  'ADMIN',
  'MANAGER',
  'COORDINATOR',
  'COMPANY',
]);

export function buildMembership(
  user: ProviserUser | null,
  ws: {
    membership?: {
      isOwner?: boolean;
      role?: string;
      departmentId?: string | null;
      departmentName?: string | null;
      status?: string;
    };
    workspace?: { status?: string } | null;
  } | null,
  coordinatorRole?: string | null
): ProviserMembership {
  const role = String(user?.role ?? ws?.membership?.role ?? coordinatorRole ?? '').toUpperCase();
  const isOwner = ws?.membership?.isOwner === true || role === 'COMPANY';
  const departmentId = ws?.membership?.departmentId ?? null;
  const departmentName = ws?.membership?.departmentName ?? null;
  const workspaceStatus = ws?.workspace?.status ?? ws?.membership?.status ?? null;

  if (ws?.workspace && workspaceStatus === 'APPROVED') {
    const canManageStaff = isOwner || MANAGER_ROLES.has(role);
    const canViewPerformance = isOwner || MANAGER_ROLES.has(role);
    const isDepartmentScoped = !isOwner && MANAGER_ROLES.has(role) && !!departmentId;
    return {
      mode: 'private',
      isOwner,
      role,
      departmentId,
      departmentName,
      workspaceStatus,
      canManageDepartments: isOwner,
      canManageStaff,
      canViewPerformance,
      performanceScope: isOwner ? 'workspace' : isDepartmentScoped ? 'department' : null,
      canViewCompanyWide: isOwner,
      isDepartmentScoped,
      scopeDepartmentId: isDepartmentScoped ? departmentId : null,
    };
  }

  if (COORDINATOR_STAFF_MANAGER_ROLES.has(role) || COORDINATOR_OWNER_ROLES.has(role)) {
    const coordOwner = COORDINATOR_OWNER_ROLES.has(role);
    const coordManager = role === 'MANAGER' || coordOwner;
    const isDepartmentScoped = coordManager && !coordOwner;
    return {
      mode: 'coordinator',
      isOwner: coordOwner,
      role,
      departmentId: null,
      departmentName: null,
      workspaceStatus: null,
      canManageDepartments: false,
      canManageStaff: COORDINATOR_STAFF_MANAGER_ROLES.has(role),
      canViewPerformance: coordManager || MANAGER_ROLES.has(role),
      performanceScope: coordOwner || role === 'MANAGER' ? 'workspace' : null,
      canViewCompanyWide: coordOwner,
      isDepartmentScoped,
      scopeDepartmentId: null,
    };
  }

  return {
    mode: 'none',
    isOwner: false,
    role,
    departmentId,
    departmentName,
    workspaceStatus,
    canManageDepartments: false,
    canManageStaff: false,
    canViewPerformance: false,
    performanceScope: null,
    canViewCompanyWide: false,
    isDepartmentScoped: !!departmentId,
    scopeDepartmentId: departmentId,
  };
}

export function canViewSitesMap(role: string, mode: ProviserWorkspaceMode): boolean {
  const r = role.toUpperCase();
  if (mode === 'private' || mode === 'coordinator') return true;
  return [
    'COMPANY',
    'PERSONAL',
    'MANAGER',
    'COORDINATOR',
    'ENGINEER',
    'QUALITY_ENGINEER',
    'SUPERVISION_ENGINEER',
    'TECHNICIAN',
    'WORKER',
  ].includes(r);
}

/** Query param for department-scoped API calls from the web app */
export function departmentQueryParam(m: ProviserMembership): string {
  if (m.canViewCompanyWide || !m.scopeDepartmentId) return '';
  return `&departmentId=${encodeURIComponent(m.scopeDepartmentId)}`;
}
