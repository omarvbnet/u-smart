import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { cancellationsGuard } from '@/lib/private-company-cancellations';
import { loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';
import { CANCELLATION_REASON_KEY, readCancellationFromParsed } from '@/lib/ticket-cancellation';
import { normalizeProvince } from '@/lib/private-company-warehouse';
import {
  parseAnalyticsPeriod,
  analyticsPeriodBadRequest,
  ymdUTC,
  inclusiveUtcDayCount,
} from '@/lib/private-company-analytics-range';
import { assignedStaffIdFromCompanyJson, parseTicketCompanyJson } from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

type ReasonAgg = { reason: string; ticketCount: number; ticketIds: string[] };

function bumpReason(agg: Map<string, ReasonAgg>, reason: string, ticketId: string) {
  const key = reason.trim() || 'Unknown';
  const row = agg.get(key) ?? { reason: key, ticketCount: 0, ticketIds: [] };
  if (!row.ticketIds.includes(ticketId)) {
    row.ticketIds.push(ticketId);
    row.ticketCount += 1;
  }
  agg.set(key, row);
}

/**
 * GET /api/provisor-private-company/cancellations/analytics?from=&to=&days=90&province=&departmentId=
 * Prefer `from` + `to` (inclusive); otherwise rolling `days` window (default 90).
 */
export async function GET(req: NextRequest) {
  const guard = await cancellationsGuard(req);
  if (!guard.ok) return guard.response;

  const policy = await loadPlatformTicketPolicy();
  const settings = { reasons: policy.cancellationReasons };

  const url = new URL(req.url);
  const hasExplicitRange =
    !!(url.searchParams.get('from')?.trim() && url.searchParams.get('to')?.trim());
  const daysRaw = Number(url.searchParams.get('days') ?? '90');
  const daysFallback = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 730) : 90;
  const periodParsed = parseAnalyticsPeriod(url);
  if (!periodParsed.ok) return analyticsPeriodBadRequest(periodParsed.message);
  const { from: rangeFrom, to: rangeTo } = periodParsed;
  const provinceFilter = normalizeProvince(url.searchParams.get('province'));
  let departmentId = url.searchParams.get('departmentId')?.trim() || null;

  let scope: 'workspace' | 'department' | 'self' = 'workspace';

  if (!guard.isOwner && MANAGER_ROLES.has(guard.actorRole) && guard.actorDepartmentId) {
    scope = 'department';
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only view analytics for your department.' },
        { status: 403 }
      );
    }
    departmentId = guard.actorDepartmentId;
  } else if (!guard.isOwner && !MANAGER_ROLES.has(guard.actorRole)) {
    return NextResponse.json(
      { success: false, message: 'Only owners, managers, and coordinators can view cancellation analytics.' },
      { status: 403 }
    );
  }

  const [departments, staffList, tickets] = await Promise.all([
    prisma.privateCompanyDepartment.findMany({
      where: { companyId: guard.companyId },
      select: { id: true, name: true },
    }),
    prisma.ticketRequester.findMany({
      where: { privateCompanyId: guard.companyId },
      select: {
        id: true,
        name: true,
        username: true,
        province: true,
        privateCompanyDepartmentId: true,
      },
    }),
    prisma.visitorRequest.findMany({
      where: {
        privateCompanyId: guard.companyId,
        assignmentScope: 'PRIVATE_COMPANY_STAFF',
        status: 'CANCELLED',
        updatedAt: { gte: rangeFrom, lte: rangeTo },
      },
      select: {
        id: true,
        company: true,
        province: true,
        privateCompanyTargetDepartmentId: true,
        requesterId: true,
        siteName: true,
        technique: true,
        updatedAt: true,
      },
    }),
  ]);

  const deptName = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) {
    deptName.set(d.id, d.name);
  }

  const staffMeta = new Map<
    string,
    { province: string | null; departmentId: string | null; departmentName: string | null }
  >();
  for (const s of staffList as Array<{
    id: string;
    province: string | null;
    privateCompanyDepartmentId: string | null;
  }>) {
    const did = s.privateCompanyDepartmentId;
    staffMeta.set(s.id, {
      province: s.province?.trim() || null,
      departmentId: did,
      departmentName: did ? deptName.get(did) ?? null : null,
    });
  }

  const byReason = new Map<string, ReasonAgg>();
  const byProvince = new Map<string, Map<string, ReasonAgg>>();
  const byDepartment = new Map<string | null, Map<string, ReasonAgg>>();

  const cases: Array<{
    ticketId: string;
    siteName: string | null;
    technique: string | null;
    reason: string;
    province: string | null;
    departmentId: string | null;
    departmentName: string | null;
    cancelledAt: string;
  }> = [];

  for (const t of tickets as Array<{
    id: string;
    company: string | null;
    province: string | null;
    privateCompanyTargetDepartmentId: string | null;
    siteName: string | null;
    technique: string | null;
    updatedAt: Date;
  }>) {
    const parsed = parseTicketCompanyJson(t.company);
    const cancel = readCancellationFromParsed(parsed);
    const reason =
      (cancel.cancellationReason?.trim() ||
        (typeof parsed[CANCELLATION_REASON_KEY] === 'string'
          ? String(parsed[CANCELLATION_REASON_KEY]).trim()
          : '')) ||
      'Unknown';

    const assigneeId = assignedStaffIdFromCompanyJson(parsed);
    const sm = assigneeId ? staffMeta.get(assigneeId) : null;
    const deptId = t.privateCompanyTargetDepartmentId ?? sm?.departmentId ?? null;
    if (departmentId && deptId !== departmentId) continue;

    const prov = sm?.province ?? t.province?.trim() ?? null;
    if (provinceFilter && prov !== provinceFilter) continue;

    bumpReason(byReason, reason, t.id);

    const provKey = prov ?? 'Unknown';
    if (!byProvince.has(provKey)) byProvince.set(provKey, new Map());
    bumpReason(byProvince.get(provKey)!, reason, t.id);

    if (!byDepartment.has(deptId)) byDepartment.set(deptId, new Map());
    bumpReason(byDepartment.get(deptId)!, reason, t.id);

    cases.push({
      ticketId: t.id,
      siteName: t.siteName,
      technique: t.technique,
      reason,
      province: prov,
      departmentId: deptId,
      departmentName: deptId ? deptName.get(deptId) ?? null : null,
      cancelledAt: t.updatedAt.toISOString(),
    });
  }

  const finalizeReasonMap = (m: Map<string, ReasonAgg>) =>
    [...m.values()].sort((a, b) => b.ticketCount - a.ticketCount);

  const daysOut = hasExplicitRange
    ? inclusiveUtcDayCount(rangeFrom, rangeTo)
    : daysFallback;

  return NextResponse.json({
    success: true,
    scope,
    days: daysOut,
    from: ymdUTC(rangeFrom),
    to: ymdUTC(rangeTo),
    provinceFilter,
    settings,
    totalCancelled: cases.length,
    byReason: finalizeReasonMap(byReason),
    byProvince: [...byProvince.entries()].map(([province, m]) => ({
      province,
      totalCancelled: [...m.values()].reduce((s, r) => s + r.ticketCount, 0),
      byReason: finalizeReasonMap(m),
    })),
    byDepartment: [...byDepartment.entries()].map(([departmentId, m]) => ({
      departmentId,
      departmentName: departmentId ? deptName.get(departmentId) ?? 'Department' : 'Unassigned',
      totalCancelled: [...m.values()].reduce((s, r) => s + r.ticketCount, 0),
      byReason: finalizeReasonMap(m),
    })),
    cases: cases.sort((a, b) => b.cancelledAt.localeCompare(a.cancelledAt)),
  });
}
