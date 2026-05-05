import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import { hasPrivilege, taskCategoryToDepartment } from '@/lib/coordinator-access';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function ensureLegacyRequesterCompany(requesterId: string): Promise<string | null> {
  const requester = await (prisma as any).ticketRequester.findUnique({
    where: { id: requesterId },
    select: { id: true, username: true, email: true, role: true, name: true, company: true },
  });
  const role = String((requester as { role?: string })?.role ?? '').toUpperCase();
  if (!requester || role !== 'COMPANY') return null;

  const linked = await getLinkedCoordinatorCompanyId(prisma, {
    id: requester.id,
    username: requester.username ?? '',
    email: requester.email ?? null,
    role,
  });
  if (linked) return linked;

  const companyName =
    (typeof requester.company === 'string' && requester.company.trim()) ||
    (typeof requester.name === 'string' && requester.name.trim()) ||
    requester.username ||
    `Company ${requester.id.slice(-6)}`;
  const slugBase = slugify(companyName) || `company-${requester.id.slice(-6).toLowerCase()}`;
  let companyId: string | null = null;
  for (let i = 0; i < 10; i++) {
    const slug = i === 0 ? slugBase : `${slugBase}-${Math.floor(100 + Math.random() * 900)}`;
    try {
      const created = await (prisma as any).coordinatorCompany.create({
        data: { name: companyName, slug },
        select: { id: true },
      });
      companyId = created.id;
      break;
    } catch {
      // retry on slug conflict
    }
  }
  if (!companyId) return null;

  const ownerUsername = `${slugBase.replace(/-/g, '').slice(0, 12) || 'owner'}${Math.floor(100 + Math.random() * 900)}`;
  const ownerEmail =
    (typeof requester.email === 'string' && requester.email.trim().toLowerCase()) ||
    `${ownerUsername}@legacy-company.local`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 10);
  await (prisma as any).coordinatorUser.create({
    data: {
      username: ownerUsername,
      email: ownerEmail,
      name: requester.name ?? companyName,
      passwordHash,
      role: 'COMPANY_OWNER',
      status: 'ACTIVE',
      mustChangePassword: true,
      companyId,
    },
    select: { id: true },
  });
  return companyId;
}

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  const auth = getRequesterFromRequest(req);
  let companyId: string | null = ctx?.companyId ?? null;
  let role = ctx?.role ?? 'COMPANY';
  let departments = ctx?.departments ?? [];
  let privileges = ctx?.privileges ?? [];

  if (!companyId && auth?.payload.identitySource === 'ticket_requester') {
    companyId = await ensureLegacyRequesterCompany(auth.payload.requesterId);
    role = 'COMPANY';
    departments = [];
    privileges = [];
  }
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const fromDate = from ? new Date(from) : null;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  const toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const [users, tickets] = await Promise.all([
    (prisma as any).coordinatorUser.findMany({
      where: { companyId },
      select: { id: true, role: true, status: true },
    }),
    (prisma as any).visitorRequest.findMany({
      where: {
        coordinatorCompanyId: companyId,
        ...(fromDate || toDate
          ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
          : {}),
      },
      select: {
        id: true,
        status: true,
        taskCategory: true,
        roleScope: true,
        assigneeCoordinatorUserId: true,
        createdByCoordinatorUserId: true,
        workflowState: true,
        createdAt: true,
        completedAt: true,
        company: true,
      },
    }),
  ]);

  const staffByRole: Record<string, number> = {};
  const ticketsByRoleScope: Record<string, number> = {};
  const ticketsByCategory: Record<string, number> = {};
  const ticketsByStatus: Record<string, number> = {};
  let totalVisibleTickets = 0;
  const departmentPerformance: Record<string, { totalTasks: number; inProgress: number; pending: number; withInSla: number; overSla: number; totalDelays: number; inspectionResults: number }> = {};
  const performanceByStaff: Record<string, { assigned: number; completed: number; needsEdit: number; resubmitted: number }> = {};

  const roleCanViewAllDepartments =
    role === 'ADMIN' ||
    role === 'COMPANY_OWNER' ||
    role === 'MANAGER' ||
    hasPrivilege(privileges, 'VIEW_ALL_DEPARTMENTS_DASHBOARD');

  for (const u of users as Array<{ id: string; role: string }>) {
    staffByRole[u.role] = (staffByRole[u.role] ?? 0) + 1;
    performanceByStaff[u.id] = { assigned: 0, completed: 0, needsEdit: 0, resubmitted: 0 };
  }

  for (const t of tickets as Array<{
    status: string;
    taskCategory?: string | null;
    roleScope?: string | null;
    assigneeCoordinatorUserId?: string | null;
    workflowState?: string | null;
    createdAt: Date;
    completedAt?: Date | null;
    company?: string | null;
  }>) {
    const department = taskCategoryToDepartment(t.taskCategory ?? null);
    if (!roleCanViewAllDepartments && departments.length > 0 && !departments.includes(department)) {
      continue;
    }
    totalVisibleTickets += 1;
    const category = t.taskCategory || 'UNSPECIFIED';
    ticketsByCategory[category] = (ticketsByCategory[category] ?? 0) + 1;
    ticketsByStatus[t.status] = (ticketsByStatus[t.status] ?? 0) + 1;
    const roleScope = (t as { roleScope?: string | null }).roleScope || 'ANY';
    ticketsByRoleScope[roleScope] = (ticketsByRoleScope[roleScope] ?? 0) + 1;

    let slaHours: number | null = null;
    try {
      const parsed = typeof t.company === 'string' ? JSON.parse(t.company) : {};
      slaHours = typeof parsed.slaHours === 'number' ? parsed.slaHours : null;
    } catch {
      slaHours = null;
    }
    const dep = departmentPerformance[department] ?? {
      totalTasks: 0,
      inProgress: 0,
      pending: 0,
      withInSla: 0,
      overSla: 0,
      totalDelays: 0,
      inspectionResults: 0,
    };
    dep.totalTasks += 1;
    if (t.status === 'IN_PROGRESS') dep.inProgress += 1;
    if (t.status === 'PENDING') dep.pending += 1;
    if (t.status === 'COMPLETED') dep.inspectionResults += 1;
    if (slaHours && slaHours > 0) {
      const elapsedHours = ((t.completedAt ? new Date(t.completedAt) : new Date()).getTime() - new Date(t.createdAt).getTime()) / 36e5;
      if (elapsedHours > slaHours) {
        dep.overSla += 1;
        dep.totalDelays += 1;
      } else {
        dep.withInSla += 1;
      }
    }
    departmentPerformance[department] = dep;

    if (t.assigneeCoordinatorUserId) {
      const perf = performanceByStaff[t.assigneeCoordinatorUserId] ?? { assigned: 0, completed: 0, needsEdit: 0, resubmitted: 0 };
      perf.assigned += 1;
      if (t.status === 'COMPLETED') perf.completed += 1;
      if (t.workflowState === 'NEEDS_EDIT') perf.needsEdit += 1;
      if (t.workflowState === 'RESUBMITTED') perf.resubmitted += 1;
      performanceByStaff[t.assigneeCoordinatorUserId] = perf;
    }
  }

  const staffPerformance = (users as Array<{ id: string; role: string; status: string }>).map((u) => ({
    userId: u.id,
    role: u.role,
    status: u.status,
    assigned: performanceByStaff[u.id]?.assigned ?? 0,
    completed: performanceByStaff[u.id]?.completed ?? 0,
    needsEdit: performanceByStaff[u.id]?.needsEdit ?? 0,
    resubmitted: performanceByStaff[u.id]?.resubmitted ?? 0,
  }));

  return NextResponse.json({
    success: true,
    dashboard: {
      role,
      departments,
      staffByRole,
      totalStaff: users.length,
      totalTickets: totalVisibleTickets,
      ticketsByRoleScope,
      ticketsByCategory,
      ticketsByStatus,
      departmentPerformance,
      staffPerformance,
    },
  });
}
