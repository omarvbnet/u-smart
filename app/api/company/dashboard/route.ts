import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  if (!ctx) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const [users, tickets] = await Promise.all([
    (prisma as any).coordinatorUser.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, role: true, status: true },
    }),
    (prisma as any).visitorRequest.findMany({
      where: { coordinatorCompanyId: ctx.companyId },
      select: {
        id: true,
        status: true,
        taskCategory: true,
        assigneeCoordinatorUserId: true,
        createdByCoordinatorUserId: true,
        workflowState: true,
      },
    }),
  ]);

  const staffByRole: Record<string, number> = {};
  const ticketsByRoleScope: Record<string, number> = {};
  const ticketsByCategory: Record<string, number> = {};
  const ticketsByStatus: Record<string, number> = {};
  const performanceByStaff: Record<string, { assigned: number; completed: number; needsEdit: number; resubmitted: number }> = {};

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
  }>) {
    const category = t.taskCategory || 'UNSPECIFIED';
    ticketsByCategory[category] = (ticketsByCategory[category] ?? 0) + 1;
    ticketsByStatus[t.status] = (ticketsByStatus[t.status] ?? 0) + 1;
    const roleScope = (t as { roleScope?: string | null }).roleScope || 'ANY';
    ticketsByRoleScope[roleScope] = (ticketsByRoleScope[roleScope] ?? 0) + 1;
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
      staffByRole,
      totalStaff: users.length,
      totalTickets: tickets.length,
      ticketsByRoleScope,
      ticketsByCategory,
      ticketsByStatus,
      staffPerformance,
    },
  });
}
