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
import { normalizeProvince } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type ReasonAgg = { reasonId: string; label: string; count: number };
type ProvinceAgg = { province: string; count: number; byReason: Map<string, number> };

/**
 * GET /api/provisor-private-company/maintenance-reasons/analytics?from=&to=&days=90&departmentId=&province=
 */
export async function GET(req: NextRequest) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const periodParsed = parseAnalyticsPeriod(url);
  if (!periodParsed.ok) return analyticsPeriodBadRequest(periodParsed.message);
  const { from: rangeFrom, to: rangeTo } = periodParsed;
  const provinceFilter = normalizeProvince(url.searchParams.get('province'));

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

  const [catalogRows, departments, tickets] = await Promise.all([
    prisma.privateCompanyMaintenanceReason.findMany({
      where: {
        companyId: guard.companyId,
        ...(departmentId ? { departmentId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, departmentId: true, active: true },
    }),
    prisma.privateCompanyDepartment.findMany({
      where: { companyId: guard.companyId },
      select: { id: true, name: true },
    }),
    prisma.visitorRequest.findMany({
      where: ticketWhere,
      select: {
        id: true,
        technique: true,
        privateCompanyId: true,
        privateCompanyTargetDepartmentId: true,
        province: true,
        siteName: true,
        company: true,
        completedAt: true,
        updatedAt: true,
      },
      take: 5000,
    }),
  ]);

  const counts = new Map<string, ReasonAgg>();
  const byProvince = new Map<string, ProvinceAgg>();
  const departmentNameById = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) {
    departmentNameById.set(d.id, d.name);
  }
  const cases: Array<{
    ticketId: string;
    siteName: string | null;
    reasonId: string;
    reasonLabel: string;
    province: string | null;
    departmentId: string | null;
    departmentName: string | null;
    completedAt: string | null;
  }> = [];
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
    const reasonLabel = label || 'Unknown';
    const province = (t.province ?? '').trim() || null;
    if (provinceFilter && province !== provinceFilter) continue;

    bump(reasonId, reasonLabel);

    const provinceKey = province ?? 'Unknown';
    const prov = byProvince.get(provinceKey) ?? {
      province: provinceKey,
      count: 0,
      byReason: new Map<string, number>(),
    };
    prov.count += 1;
    const rk = reasonId || `label:${reasonLabel.toLowerCase()}`;
    prov.byReason.set(rk, (prov.byReason.get(rk) ?? 0) + 1);
    byProvince.set(provinceKey, prov);

    const departmentIdForCase = t.privateCompanyTargetDepartmentId ?? null;
    cases.push({
      ticketId: t.id,
      siteName: t.siteName ?? null,
      reasonId,
      reasonLabel,
      province,
      departmentId: departmentIdForCase,
      departmentName: departmentIdForCase
        ? (departmentNameById.get(departmentIdForCase) ?? null)
        : null,
      completedAt: (t.completedAt ?? t.updatedAt)?.toISOString() ?? null,
    });
  }

  const byReason = [...counts.values()].sort((a, b) => b.count - a.count);
  const totalWithReason = byReason.reduce((s, r) => s + r.count, 0);

  return NextResponse.json({
    success: true,
    scope,
    departmentId,
    from: rangeFrom.toISOString(),
    to: rangeTo.toISOString(),
    provinceFilter,
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
    byProvince: [...byProvince.values()]
      .map((p) => ({
        province: p.province,
        count: p.count,
        byReason: byReason
          .map((r) => ({
            reasonId: r.reasonId,
            label: r.label,
            count: p.byReason.get(r.reasonId || `label:${r.label.toLowerCase()}`) ?? 0,
          }))
          .filter((r) => r.count > 0)
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count),
    cases: cases.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
  });
}
