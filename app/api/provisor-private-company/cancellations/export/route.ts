import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
import { cancellationsGuard } from '@/lib/private-company-cancellations';
import { normalizeProvince } from '@/lib/private-company-warehouse';
import { CANCELLATION_REASON_KEY, readCancellationFromParsed } from '@/lib/ticket-cancellation';
import { assignedStaffIdFromCompanyJson, parseTicketCompanyJson } from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

function parseInclusiveRange(fromParam: string | null, toParam: string | null) {
  const f = fromParam?.trim();
  const t = toParam?.trim();
  if (!f || !t) return null;
  const fromNorm = f.includes('T') ? f : `${f}T00:00:00.000Z`;
  const toNorm = t.includes('T') ? t : `${t}T23:59:59.999Z`;
  const from = new Date(fromNorm);
  const to = new Date(toNorm);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return null;
  if (from > to) return null;
  return { from, to };
}

export async function GET(req: NextRequest) {
  const guard = await cancellationsGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsedRange = parseInclusiveRange(url.searchParams.get('from'), url.searchParams.get('to'));
  if (!parsedRange) {
    return NextResponse.json(
      { success: false, message: 'Query params from and to are required (YYYY-MM-DD).' },
      { status: 400 }
    );
  }
  const { from, to } = parsedRange;
  const provinceFilter = normalizeProvince(url.searchParams.get('province'));
  let departmentId = url.searchParams.get('departmentId')?.trim() || null;

  if (!guard.isOwner && MANAGER_ROLES.has(guard.actorRole) && guard.actorDepartmentId) {
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only export your department analytics.' },
        { status: 403 }
      );
    }
    departmentId = guard.actorDepartmentId;
  } else if (!guard.isOwner && !MANAGER_ROLES.has(guard.actorRole)) {
    return NextResponse.json(
      { success: false, message: 'Only owners, managers, and coordinators can export.' },
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
      select: { id: true, province: true, privateCompanyDepartmentId: true },
    }),
    prisma.visitorRequest.findMany({
      where: {
        privateCompanyId: guard.companyId,
        assignmentScope: 'PRIVATE_COMPANY_STAFF',
        status: 'CANCELLED',
        updatedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        company: true,
        province: true,
        privateCompanyTargetDepartmentId: true,
        siteName: true,
        technique: true,
        updatedAt: true,
      },
      take: 10000,
    }),
  ]);

  const deptName = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) deptName.set(d.id, d.name);
  const staffMeta = new Map<string, { province: string | null; departmentId: string | null }>();
  for (const s of staffList as Array<{ id: string; province: string | null; privateCompanyDepartmentId: string | null }>) {
    staffMeta.set(s.id, {
      province: s.province?.trim() || null,
      departmentId: s.privateCompanyDepartmentId ?? null,
    });
  }

  const byReason = new Map<string, number>();
  const byProvinceReason = new Map<string, Map<string, number>>();
  const cases: Array<Record<string, string | number>> = [];

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
          : '') ||
        'Unknown');

    const assigneeId = assignedStaffIdFromCompanyJson(parsed);
    const staff = assigneeId ? staffMeta.get(assigneeId) : null;
    const deptId = t.privateCompanyTargetDepartmentId ?? staff?.departmentId ?? null;
    if (departmentId && deptId !== departmentId) continue;
    const province = staff?.province ?? t.province?.trim() ?? null;
    if (provinceFilter && province !== provinceFilter) continue;

    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    const pk = province ?? 'Unknown';
    const reasonMap = byProvinceReason.get(pk) ?? new Map<string, number>();
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    byProvinceReason.set(pk, reasonMap);

    cases.push({
      ticketId: t.id,
      siteName: t.siteName ?? '',
      technique: t.technique ?? '',
      reason,
      province: province ?? '',
      department: deptId ? deptName.get(deptId) ?? '' : '',
      cancelledAt: t.updatedAt.toISOString(),
    });
  }

  const reasonRows = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  const provinceRows = [...byProvinceReason.entries()].flatMap(([province, reasonMap]) =>
    [...reasonMap.entries()]
      .map(([reason, count]) => ({ province, reason, count }))
      .sort((a, b) => b.count - a.count)
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonRows), 'By Reason');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(provinceRows), 'By Province');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cases), 'Cases');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cancellation-reasons-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
