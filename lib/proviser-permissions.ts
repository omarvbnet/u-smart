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
};

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);
const COORDINATOR_OWNER_ROLES = new Set(['COMPANY_OWNER', 'ADMIN', 'COMPANY']);
const COORDINATOR_STAFF_MANAGER_ROLES = new Set(['COMPANY_OWNER', 'ADMIN', 'MANAGER', 'COORDINATOR', 'COMPANY']);

export function buildMembership(
  user: ProviserUser | null,
  ws: {
    membership?: { isOwner?: boolean; role?: string; departmentId?: string | null; departmentName?: string | null; status?: string };
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
      performanceScope: isOwner ? 'workspace' : MANAGER_ROLES.has(role) && departmentId ? 'department' : null,
    };
  }

  if (COORDINATOR_STAFF_MANAGER_ROLES.has(role) || COORDINATOR_OWNER_ROLES.has(role)) {
    const coordOwner = COORDINATOR_OWNER_ROLES.has(role);
    const coordManager = role === 'MANAGER' || coordOwner;
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
      performanceScope: coordOwner || role === 'MANAGER' ? 'workspace' : MANAGER_ROLES.has(role) ? 'department' : null,
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
  };
}

export function canViewSitesMap(role: string, mode: ProviserWorkspaceMode): boolean {
  const r = role.toUpperCase();
  if (mode === 'private' || mode === 'coordinator') return true;
  return ['COMPANY', 'PERSONAL', 'MANAGER', 'COORDINATOR', 'ENGINEER', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'WORKER'].includes(r);
}
