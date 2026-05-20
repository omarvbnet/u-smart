import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
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
  const guard = await maintenanceReasonsGuard(req);
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
  if (!guard.isOwner) departmentId = guard.actorDepartmentId;

  const ticketWhere: Record<string, unknown> = {
    privateCompanyId: guard.companyId,
    assignmentScope: 'PRIVATE_COMPANY_STAFF',
    OR: [{ completedAt: { gte: from, lte: to } }, { updatedAt: { gte: from, lte: to } }],
  };
  if (departmentId) ticketWhere.privateCompanyTargetDepartmentId = departmentId;

  const [departments, tickets] = await Promise.all([
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
      take: 10000,
    }),
  ]);
  const deptNameById = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) deptNameById.set(d.id, d.name);

  const byReason = new Map<string, { reasonId: string; label: string; count: number }>();
  const byProvince = new Map<string, Map<string, number>>();
  const cases: Array<Record<string, string | number>> = [];

  for (const t of tickets as Array<{
    id: string;
    technique: string | null;
    privateCompanyId: string | null;
    privateCompanyTargetDepartmentId: string | null;
    province: string | null;
    siteName: string | null;
    company: string | null;
    completedAt: Date | null;
    updatedAt: Date;
  }>) {
    const isMaint = await resolveIsMaintenanceVisitorRequest(prisma, t.technique, t.privateCompanyId);
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
    const reasonKey = reasonId || `label:${reasonLabel.toLowerCase()}`;
    const province = (t.province ?? '').trim() || null;
    if (provinceFilter && province !== provinceFilter) continue;

    const current = byReason.get(reasonKey);
    if (current) current.count += 1;
    else byReason.set(reasonKey, { reasonId, label: reasonLabel, count: 1 });

    const pk = province ?? 'Unknown';
    const reasonMap = byProvince.get(pk) ?? new Map<string, number>();
    reasonMap.set(reasonKey, (reasonMap.get(reasonKey) ?? 0) + 1);
    byProvince.set(pk, reasonMap);

    const deptId = t.privateCompanyTargetDepartmentId ?? null;
    cases.push({
      ticketId: t.id,
      siteName: t.siteName ?? '',
      reasonId,
      reason: reasonLabel,
      province: province ?? '',
      department: deptId ? deptNameById.get(deptId) ?? '' : '',
      completedAt: (t.completedAt ?? t.updatedAt).toISOString(),
    });
  }

  const reasonRows = [...byReason.values()].sort((a, b) => b.count - a.count);
  const provinceRows = [...byProvince.entries()].flatMap(([province, reasonMap]) =>
    [...reasonMap.entries()]
      .map(([reasonKey, count]) => {
        const reason = byReason.get(reasonKey);
        return { province, reason: reason?.label ?? reasonKey, count };
      })
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
      'Content-Disposition': `attachment; filename="maintenance-reasons-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
