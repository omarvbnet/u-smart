import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  analyticsPeriodBadRequest,
  parseAnalyticsPeriod,
} from '@/lib/private-company-analytics-range';
import {
  MAINTENANCE_COMPLETION_REASON_ID_KEY,
  MAINTENANCE_COMPLETION_REASON_LABEL_KEY,
  maintenanceReasonsGuard,
} from '@/lib/private-company-maintenance-reasons';
import { resolveIsMaintenanceVisitorRequest } from '@/lib/maintenance-requester-confirmation';
import { parseTicketCompanyJson } from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type ReasonAgg = { reasonId: string; label: string; count: number };

/**
 * GET /api/provisor-private-company/maintenance-reasons/analytics?from=&to=&days=90&departmentId=
 */
export async function GET(req: NextRequest) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const periodParsed = parseAnalyticsPeriod(url);
  if (!periodParsed.ok) return analyticsPeriodBadRequest(periodParsed.message);
  const { from: rangeFrom, to: rangeTo } = periodParsed;

  let departmentId = url.searchParams.get('departmentId')?.trim() || null;
  let scope: 'workspace' | 'department' = 'workspace';

  if (!guard.isOwner) {
    if (!guard.actorDepartmentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your account must be assigned to a department to view maintenance reason analytics.',
        },
        { status: 403 }
      );
    }
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only view analytics for your department.' },
        { status: 403 }
      );
    }
    scope = 'department';
    departmentId = guard.actorDepartmentId;
  }

  const ticketWhere: Record<string, unknown> = {
    privateCompanyId: guard.companyId,
    assignmentScope: 'PRIVATE_COMPANY_STAFF',
    OR: [
      { completedAt: { gte: rangeFrom, lte: rangeTo } },
      { updatedAt: { gte: rangeFrom, lte: rangeTo } },
    ],
  };
  if (departmentId) {
    ticketWhere.privateCompanyTargetDepartmentId = departmentId;
  }

  const [catalogRows, tickets] = await Promise.all([
    prisma.privateCompanyMaintenanceReason.findMany({
      where: {
        companyId: guard.companyId,
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, departmentId: true, active: true },
    }),
    prisma.visitorRequest.findMany({
      where: ticketWhere,
      select: {
        id: true,
        technique: true,
        privateCompanyId: true,
        privateCompanyTargetDepartmentId: true,
        company: true,
        completedAt: true,
      },
      take: 5000,
    }),
  ]);

  const counts = new Map<string, ReasonAgg>();
  const bump = (reasonId: string, label: string) => {
    const key = reasonId || `label:${label.toLowerCase()}`;
    const cur = counts.get(key);
    if (cur) {
      cur.count += 1;
      return;
    }
    counts.set(key, { reasonId, label, count: 1 });
  };

  for (const t of tickets) {
    const isMaint = await resolveIsMaintenanceVisitorRequest(
      prisma,
      t.technique,
      t.privateCompanyId
    );
    if (!isMaint) continue;
    const parsed = parseTicketCompanyJson(t.company);
    const reasonId =
      typeof parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY] === 'string'
        ? String(parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY]).trim()
        : '';
    const label =
      typeof parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY] === 'string'
        ? String(parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY]).trim()
        : '';
    if (!reasonId && !label) continue;
    bump(reasonId, label || 'Unknown');
  }

  const byReason = [...counts.values()].sort((a, b) => b.count - a.count);
  const totalWithReason = byReason.reduce((s, r) => s + r.count, 0);

  return NextResponse.json({
    success: true,
    scope,
    departmentId,
    from: rangeFrom.toISOString(),
    to: rangeTo.toISOString(),
    totalWithReason,
    ticketSampleSize: tickets.length,
    catalog: catalogRows.map((r: { id: string; label: string; departmentId: string; active: boolean }) => ({
      id: r.id,
      label: r.label,
      departmentId: r.departmentId,
      active: r.active,
      count: counts.get(r.id)?.count ?? 0,
    })),
    byReason,
  });
}
