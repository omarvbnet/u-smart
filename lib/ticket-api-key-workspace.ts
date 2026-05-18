import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const PRIVATE_WORKSPACE_API_ROLES = new Set(['MANAGER', 'COORDINATOR', 'COMPANY']);

export type WorkspaceDepartmentOption = { id: string; name: string };

export type RequesterWorkspaceApiContext = {
  companyId: string;
  companyName: string;
  departments: WorkspaceDepartmentOption[];
  requiresDepartmentSelection: boolean;
};

export function isPrivateWorkspaceApiRole(role: string | null | undefined): boolean {
  return PRIVATE_WORKSPACE_API_ROLES.has(String(role ?? '').toUpperCase());
}

export async function getRequesterWorkspaceApiContext(
  requesterId: string,
  role: string | null | undefined
): Promise<RequesterWorkspaceApiContext | null> {
  if (!isPrivateWorkspaceApiRole(role)) return null;
  const membership = await getPrivateCompanyMembership(requesterId);
  const companyId = membership.effectiveCompanyId;
  if (!companyId || !membership.isActive) return null;

  const company = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, status: true },
  });
  if (!company || company.status !== 'APPROVED') return null;

  const departments: WorkspaceDepartmentOption[] = await prisma.privateCompanyDepartment.findMany({
    where: { companyId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return {
    companyId,
    companyName: company.name,
    departments,
    requiresDepartmentSelection: departments.length > 0,
  };
}

export async function validateApiKeyDepartmentIds(
  companyId: string,
  departmentIds: string[]
): Promise<{ ok: true; departments: WorkspaceDepartmentOption[] } | { ok: false; message: string }> {
  const unique = [...new Set(departmentIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, message: 'Select at least one department for this workspace API key.' };
  }
  const rows = await prisma.privateCompanyDepartment.findMany({
    where: { companyId, id: { in: unique } },
    select: { id: true, name: true },
  });
  if (rows.length !== unique.length) {
    return { ok: false, message: 'One or more departments are not part of this workspace.' };
  }
  return { ok: true, departments: rows };
}

export function buildTicketApiIntegrationExample(body: {
  apiKey: string;
  departments: WorkspaceDepartmentOption[];
  includePrivateScope?: boolean;
}): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  bodyWithDepartments: Array<{ departmentId: string; departmentName: string; body: Record<string, unknown> }>;
} {
  const baseBody: Record<string, unknown> = {
    siteName: 'SITE-001',
    siteCoordinator: 'Baghdad — Main yard',
    technique: 'inspection',
    slaHours: 24,
    name: 'API integration',
    company: 'Your company',
    province: 'Baghdad',
  };
  if (body.includePrivateScope !== false) {
    baseBody.assignmentScope = 'PRIVATE_COMPANY';
  }

  const bodyWithDepartments =
    body.departments.length > 0
      ? body.departments.map((d) => ({
          departmentId: d.id,
          departmentName: d.name,
          body: {
            ...baseBody,
            privateCompanyTargetDepartmentId: d.id,
          },
        }))
      : [];

  if (body.departments.length === 1) {
    baseBody.privateCompanyTargetDepartmentId = body.departments[0].id;
  }

  return {
    method: 'POST',
    url: '/api/tickets',
    headers: {
      Authorization: `Bearer ${body.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: baseBody,
    bodyWithDepartments,
  };
}

export async function resolveDepartmentNames(
  companyId: string,
  departmentIds: string[]
): Promise<WorkspaceDepartmentOption[]> {
  if (!departmentIds.length) return [];
  return prisma.privateCompanyDepartment.findMany({
    where: { companyId, id: { in: departmentIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
