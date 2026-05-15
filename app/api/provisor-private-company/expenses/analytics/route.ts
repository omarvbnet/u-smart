import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { expensesGuard, loadExpenseSettings, serializeExpenseSettings } from '@/lib/private-company-expenses';
import {
  parseAnalyticsPeriod,
  analyticsPeriodBadRequest,
  ymdUTC,
  inclusiveUtcDayCount,
} from '@/lib/private-company-analytics-range';
import { normalizeProvince } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

type Agg = { totalAmount: number; expenseCount: number; ticketIds: Set<string> };

function bump(agg: Agg, amount: number, ticketId: string) {
  agg.totalAmount += amount;
  agg.expenseCount += 1;
  agg.ticketIds.add(ticketId);
}

function finalizeAgg(agg: Agg) {
  return {
    totalAmount: Math.round(agg.totalAmount * 100) / 100,
    expenseCount: agg.expenseCount,
    ticketCount: agg.ticketIds.size,
  };
}

/**
 * GET /api/provisor-private-company/expenses/analytics?from=yyyy-MM-dd&to=yyyy-MM-dd&days=90&province=&departmentId=&staffId=
 * Owner: all rollups. Manager/coordinator: department scoped. Staff: self only.
 * Prefer `from` + `to` (inclusive); otherwise `days` rolling window (default 90).
 */
export async function GET(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;

  const settingsRow = await loadExpenseSettings(guard.companyId);
  const settings = settingsRow ? serializeExpenseSettings(settingsRow) : { enabled: false, reasons: [] };

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
  const staffIdFilter = url.searchParams.get('staffId')?.trim() || null;

  const where: Record<string, unknown> = {
    companyId: guard.companyId,
    createdAt: { gte: rangeFrom, lte: rangeTo },
  };
  if (provinceFilter) where.ticketProvince = provinceFilter;
  if (staffIdFilter) where.staffRequesterId = staffIdFilter;

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
    where.departmentId = departmentId;
  } else if (!guard.isOwner && !MANAGER_ROLES.has(guard.actorRole)) {
    scope = 'self';
    where.staffRequesterId = guard.requesterId;
  } else if (departmentId) {
    where.departmentId = departmentId;
  }

  const [departments, staffList, rows] = await Promise.all([
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
        role: true,
        province: true,
        privateCompanyDepartmentId: true,
      },
    }),
    prisma.privateCompanyTicketExpense.findMany({
      where,
      select: {
        id: true,
        ticketId: true,
        staffRequesterId: true,
        amount: true,
        reason: true,
        ticketProvince: true,
        departmentId: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            siteName: true,
            technique: true,
            status: true,
            province: true,
          },
        },
        staff: { select: { id: true, name: true, username: true } },
      },
    }),
  ]);

  const deptName = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) {
    deptName.set(d.id, d.name);
  }

  const staffMeta = new Map<
    string,
    { name: string; username: string; role: string; province: string | null; departmentId: string | null }
  >();
  for (const s of staffList as Array<{
    id: string;
    name: string | null;
    username: string;
    role: string;
    province: string | null;
    privateCompanyDepartmentId: string | null;
  }>) {
    staffMeta.set(s.id, {
      name: s.name?.trim() || s.username,
      username: s.username,
      role: String(s.role ?? '').toUpperCase(),
      province: s.province?.trim() || null,
      departmentId: s.privateCompanyDepartmentId,
    });
  }

  const byProvince = new Map<string, Agg>();
  const byDepartment = new Map<string | null, Agg>();
  const byStaff = new Map<string, Agg>();
  const byReason = new Map<string, Agg>();
  const byProvinceReason = new Map<string, Map<string, Agg>>();
  let totalAmount = 0;

  const ticketSummaries = new Map<
    string,
    {
      ticketId: string;
      siteName: string | null;
      technique: string | null;
      status: string;
      province: string | null;
      totalAmount: number;
      expenseCount: number;
    }
  >();

  for (const r of rows as Array<{
    id: string;
    ticketId: string;
    staffRequesterId: string;
    amount: number;
    reason: string | null;
    ticketProvince: string | null;
    departmentId: string | null;
    ticket: {
      id: string;
      siteName: string | null;
      technique: string | null;
      status: string;
      province: string | null;
    };
  }>) {
    totalAmount += r.amount;
    const prov = r.ticketProvince ?? r.ticket?.province ?? 'Unknown';
    const pAgg = byProvince.get(prov) ?? { totalAmount: 0, expenseCount: 0, ticketIds: new Set() };
    bump(pAgg, r.amount, r.ticketId);
    byProvince.set(prov, pAgg);

    const did = r.departmentId ?? null;
    const dAgg = byDepartment.get(did) ?? { totalAmount: 0, expenseCount: 0, ticketIds: new Set() };
    bump(dAgg, r.amount, r.ticketId);
    byDepartment.set(did, dAgg);

    const sAgg = byStaff.get(r.staffRequesterId) ?? {
      totalAmount: 0,
      expenseCount: 0,
      ticketIds: new Set(),
    };
    bump(sAgg, r.amount, r.ticketId);
    byStaff.set(r.staffRequesterId, sAgg);

    const ts = ticketSummaries.get(r.ticketId) ?? {
      ticketId: r.ticketId,
      siteName: r.ticket?.siteName ?? null,
      technique: r.ticket?.technique ?? null,
      status: r.ticket?.status ?? '',
      province: r.ticket?.province ?? r.ticketProvince,
      totalAmount: 0,
      expenseCount: 0,
    };
    ts.totalAmount += r.amount;
    ts.expenseCount += 1;
    ticketSummaries.set(r.ticketId, ts);
  }

  const byProvinceOut = [...byProvince.entries()]
    .map(([province, agg]) => ({ province, ...finalizeAgg(agg) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byReasonOut = [...byReason.entries()]
    .map(([reason, agg]) => ({ reason, ...finalizeAgg(agg) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byProvinceReasonsOut = [...byProvinceReason.entries()]
    .map(([province, reasonMap]) => {
      const reasons = [...reasonMap.entries()]
        .map(([reason, agg]) => ({ reason, ...finalizeAgg(agg) }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      const pAgg = byProvince.get(province) ?? { totalAmount: 0, expenseCount: 0, ticketIds: new Set() };
      return { province, ...finalizeAgg(pAgg), reasons };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const byDepartmentOut =
    scope === 'workspace' || scope === 'department'
      ? [...byDepartment.entries()]
          .map(([departmentId, agg]) => ({
            departmentId,
            departmentName: departmentId ? deptName.get(departmentId) ?? 'Department' : 'Unassigned',
            ...finalizeAgg(agg),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
      : [];

  const byStaffOut = [...byStaff.entries()]
    .map(([staffId, agg]) => {
      const meta = staffMeta.get(staffId);
      return {
        staffId,
        name: meta?.name ?? staffId,
        role: meta?.role ?? '',
        province: meta?.province ?? null,
        departmentId: meta?.departmentId ?? null,
        departmentName: meta?.departmentId ? deptName.get(meta.departmentId) ?? null : null,
        ...finalizeAgg(agg),
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const tickets = [...ticketSummaries.values()]
    .map((t) => ({
      ...t,
      totalAmount: Math.round(t.totalAmount * 100) / 100,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 100);

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
    departmentId,
    staffId: staffIdFilter,
    settings,
    summary: {
      totalAmount: Math.round(totalAmount * 100) / 100,
      expenseCount: rows.length,
      ticketCount: ticketSummaries.size,
    },
    byProvince: byProvinceOut,
    byReason: byReasonOut,
    byProvinceReasons: byProvinceReasonsOut,
    byDepartment: byDepartmentOut,
    byStaff: byStaffOut,
    tickets,
  });
}
