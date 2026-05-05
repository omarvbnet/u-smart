export const COORDINATOR_DEPARTMENTS = [
  'NETWORK_MAINTENANCE',
  'QUALITY_CONTROL',
  'SUPERVISION',
  'ELECTRICAL_DEPLOYMENTS',
  'MECHANICAL',
] as const;

export type CoordinatorDepartment = (typeof COORDINATOR_DEPARTMENTS)[number];

export const ROLE_ALIASES: Record<string, string> = {
  OWNER: 'COMPANY_OWNER',
  COMPANY: 'COMPANY_OWNER',
  COMPANY_ROLE: 'COMPANY_OWNER',
  MANAGER: 'MANAGER',
  TEAM_LEADER: 'TEAM_LEADER',
  TEAMLEADER: 'TEAM_LEADER',
  TEAM_LEAD: 'TEAM_LEADER',
  QC: 'QUALITY_ENGINEER',
  SUPERVISOR: 'SUPERVISION_ENGINEER',
};

export const COORDINATOR_ROLES = new Set([
  'ADMIN',
  'COMPANY_OWNER',
  'MANAGER',
  'TEAM_LEADER',
  'COORDINATOR',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
]);

export const COMPANY_STAFF_CREATE_ROLES = new Set([
  'MANAGER',
  'COORDINATOR',
  'TEAM_LEADER',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
]);

export const PRIVILEGES = [
  'MANAGE_COMPANY_ACCOUNTS',
  'MANAGE_PAYMENTS',
  'MANAGE_STAFF',
  'MANAGE_CHECKLISTS',
  'MANAGE_KPI',
  'MANAGE_CONFLICTS',
  'CREATE_TASKS',
  'ASSIGN_TASKS',
  'MANAGE_SITES',
  'VIEW_ALL_DEPARTMENTS_DASHBOARD',
  'VIEW_DEPARTMENT_DASHBOARD',
  'EXPORT_IMPORT',
] as const;

export type CompanyPrivilege = (typeof PRIVILEGES)[number];
const PRIVILEGE_SET = new Set<string>(PRIVILEGES);

export type CoordinatorProfileAccess = {
  departments: CoordinatorDepartment[];
  privileges: CompanyPrivilege[];
};

export function normalizeCoordinatorRole(raw: string): string {
  const role = raw.trim().toUpperCase().replace(/\s+/g, '_');
  const mapped = ROLE_ALIASES[role] ?? role;
  return COORDINATOR_ROLES.has(mapped) ? mapped : mapped;
}

export function normalizeDepartments(raw: unknown): CoordinatorDepartment[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(COORDINATOR_DEPARTMENTS);
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter((v): v is CoordinatorDepartment => valid.has(v));
}

export function normalizePrivileges(raw: unknown): CompanyPrivilege[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toUpperCase().replace(/\s+/g, '_'))
    .filter((v): v is CompanyPrivilege => PRIVILEGE_SET.has(v));
}

export function taskCategoryToDepartment(taskCategory: string | null | undefined): CoordinatorDepartment {
  const category = String(taskCategory ?? '').toUpperCase();
  if (category === 'QUALITY') return 'QUALITY_CONTROL';
  if (category === 'SUPERVISION') return 'SUPERVISION';
  return 'NETWORK_MAINTENANCE';
}

export function defaultDepartmentsForRole(role: string): CoordinatorDepartment[] {
  switch (normalizeCoordinatorRole(role)) {
    case 'QUALITY_ENGINEER':
      return ['QUALITY_CONTROL'];
    case 'SUPERVISION_ENGINEER':
      return ['SUPERVISION'];
    case 'TECHNICIAN':
      return ['NETWORK_MAINTENANCE', 'ELECTRICAL_DEPLOYMENTS', 'MECHANICAL'];
    case 'ENGINEER':
      return ['QUALITY_CONTROL', 'SUPERVISION', 'NETWORK_MAINTENANCE'];
    case 'COORDINATOR':
    case 'TEAM_LEADER':
    case 'MANAGER':
      return ['NETWORK_MAINTENANCE', 'QUALITY_CONTROL', 'SUPERVISION'];
    case 'COMPANY_OWNER':
    case 'ADMIN':
      return [...COORDINATOR_DEPARTMENTS];
    default:
      return [];
  }
}

export function defaultPrivilegesForRole(role: string): CompanyPrivilege[] {
  const normalized = normalizeCoordinatorRole(role);
  if (normalized === 'ADMIN' || normalized === 'COMPANY_OWNER') {
    return [...PRIVILEGES];
  }
  if (normalized === 'MANAGER') {
    return [
      'MANAGE_STAFF',
      'MANAGE_CHECKLISTS',
      'MANAGE_KPI',
      'MANAGE_CONFLICTS',
      'CREATE_TASKS',
      'ASSIGN_TASKS',
      'MANAGE_SITES',
      'VIEW_ALL_DEPARTMENTS_DASHBOARD',
      'VIEW_DEPARTMENT_DASHBOARD',
      'EXPORT_IMPORT',
    ];
  }
  if (normalized === 'COORDINATOR' || normalized === 'TEAM_LEADER') {
    return [
      'CREATE_TASKS',
      'ASSIGN_TASKS',
      'MANAGE_SITES',
      'MANAGE_CHECKLISTS',
      'VIEW_DEPARTMENT_DASHBOARD',
      'EXPORT_IMPORT',
    ];
  }
  return ['VIEW_DEPARTMENT_DASHBOARD'];
}

export function encodeProfileSkills(meta: CoordinatorProfileAccess, existingSkills: string[] = []): string[] {
  const preserved = existingSkills.filter((s) => !s.startsWith('dept:') && !s.startsWith('perm:'));
  const dept = meta.departments.map((d) => `dept:${d}`);
  const perm = meta.privileges.map((p) => `perm:${p}`);
  return [...preserved, ...dept, ...perm];
}

export function decodeProfileSkills(skills: string[] | null | undefined, role: string): CoordinatorProfileAccess {
  const raw = Array.isArray(skills) ? skills : [];
  const departments = raw
    .filter((s) => s.startsWith('dept:'))
    .map((s) => s.slice(5))
    .filter((s): s is CoordinatorDepartment => (COORDINATOR_DEPARTMENTS as readonly string[]).includes(s));
  const privileges = raw
    .filter((s) => s.startsWith('perm:'))
    .map((s) => s.slice(5))
    .filter((s): s is CompanyPrivilege => PRIVILEGE_SET.has(s));
  return {
    departments: departments.length > 0 ? departments : defaultDepartmentsForRole(role),
    privileges: privileges.length > 0 ? privileges : defaultPrivilegesForRole(role),
  };
}

export function hasPrivilege(privileges: string[] | undefined, privilege: CompanyPrivilege): boolean {
  return Array.isArray(privileges) && privileges.includes(privilege);
}
