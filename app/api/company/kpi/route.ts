import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
  if (!ctx) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const category = searchParams.get('category') || 'ALL';
  const status = searchParams.get('status') || 'ALL';
  const technique = searchParams.get('technique') || 'ALL';
  const assigneeId = searchParams.get('assigneeId') || '';

  const dateFilter: Record<string, Date> = {};
  if (fromParam) dateFilter.gte = new Date(fromParam);
  if (toParam) {
    const to = new Date(toParam);
    to.setHours(23, 59, 59, 999);
    dateFilter.lte = to;
  }

  const where: Record<string, unknown> = {
    coordinatorCompanyId: ctx.companyId,
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    ...(category !== 'ALL' ? { taskCategory: category } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(technique !== 'ALL' ? { technique } : {}),
    ...(assigneeId ? { assigneeCoordinatorUserId: assigneeId } : {}),
  };

  const [tickets, conflicts, staffList] = await Promise.all([
    db.visitorRequest.findMany({
      where,
      select: {
        id: true,
        status: true,
        taskCategory: true,
        technique: true,
        slaHours: true,
        createdAt: true,
        completedAt: true,
        workflowState: true,
        inspectionResult: true,
        assigneeCoordinatorUserId: true,
        createdByCoordinatorUserId: true,
      },
    }),
    db.conflictCase
      ? db.conflictCase.count({ where: { companyId: ctx.companyId } }).catch(() => 0)
      : Promise.resolve(0),
    db.coordinatorUser.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, username: true, name: true, role: true, status: true },
    }),
  ]);

  // ── SLA analysis ─────────────────────────────────────────────────────────
  let withinSla = 0;
  let outOfSla = 0;
  let totalInspectionMs = 0;
  let totalMaintenanceMs = 0;
  let totalSupervisionMs = 0;
  let inspectionCompletedCount = 0;
  let maintenanceCompletedCount = 0;
  let supervisionCompletedCount = 0;

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byTechnique: Record<string, number> = {};
  const byResult: Record<string, number> = {};
  const performanceMap: Record<string, { assigned: number; completed: number; needsEdit: number; resubmitted: number; withinSla: number; outSla: number }> = {};

  for (const u of staffList as Array<{ id: string }>) {
    performanceMap[u.id] = { assigned: 0, completed: 0, needsEdit: 0, resubmitted: 0, withinSla: 0, outSla: 0 };
  }

  const now = Date.now();

  for (const t of tickets as Array<{
    id: string;
    status: string;
    taskCategory: string | null;
    technique: string;
    slaHours: number | null;
    createdAt: Date;
    completedAt: Date | null;
    workflowState: string | null;
    inspectionResult: string | null;
    assigneeCoordinatorUserId: string | null;
  }>) {
    // Status counts
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const cat = t.taskCategory ?? 'UNSPECIFIED';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byTechnique[t.technique] = (byTechnique[t.technique] ?? 0) + 1;
    if (t.inspectionResult) {
      byResult[t.inspectionResult] = (byResult[t.inspectionResult] ?? 0) + 1;
    }

    // SLA calculation
    const slaMs = (t.slaHours ?? 24) * 3_600_000;
    const deadlineMs = new Date(t.createdAt).getTime() + slaMs;
    const resolvedMs = t.completedAt ? new Date(t.completedAt).getTime() : now;
    const isWithin = resolvedMs <= deadlineMs;

    if (t.status === 'COMPLETED') {
      if (isWithin) withinSla++; else outOfSla++;
    } else {
      if (now > deadlineMs) outOfSla++;
    }

    // Time accumulation (ms)
    if (t.status === 'COMPLETED' && t.completedAt) {
      const durationMs = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
      if (cat === 'QUALITY') { totalInspectionMs += durationMs; inspectionCompletedCount++; }
      else if (cat === 'MAINTENANCE') { totalMaintenanceMs += durationMs; maintenanceCompletedCount++; }
      else if (cat === 'SUPERVISION') { totalSupervisionMs += durationMs; supervisionCompletedCount++; }
    }

    // Per-staff performance
    if (t.assigneeCoordinatorUserId && performanceMap[t.assigneeCoordinatorUserId]) {
      const p = performanceMap[t.assigneeCoordinatorUserId];
      p.assigned++;
      if (t.status === 'COMPLETED') p.completed++;
      if (t.workflowState === 'NEEDS_EDIT') p.needsEdit++;
      if (t.workflowState === 'RESUBMITTED') p.resubmitted++;
      if (t.status === 'COMPLETED') {
        if (isWithin) p.withinSla++; else p.outSla++;
      }
    }
  }

  const toHours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

  const staffPerformance = (staffList as Array<{ id: string; username: string; name: string | null; role: string; status: string }>).map((u) => ({
    userId: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    status: u.status,
    ...(performanceMap[u.id] ?? { assigned: 0, completed: 0, needsEdit: 0, resubmitted: 0, withinSla: 0, outSla: 0 }),
  }));

  return NextResponse.json({
    success: true,
    kpi: {
      totalTickets: (tickets as unknown[]).length,
      withinSla,
      outOfSla,
      conflictsCount: conflicts as number,
      totalInspectionHours: toHours(totalInspectionMs),
      totalMaintenanceHours: toHours(totalMaintenanceMs),
      totalSupervisionHours: toHours(totalSupervisionMs),
      avgInspectionHours: inspectionCompletedCount > 0 ? toHours(totalInspectionMs / inspectionCompletedCount) : 0,
      avgMaintenanceHours: maintenanceCompletedCount > 0 ? toHours(totalMaintenanceMs / maintenanceCompletedCount) : 0,
      byStatus,
      byCategory,
      byTechnique,
      byResult,
      staffPerformance,
    },
  });
}
