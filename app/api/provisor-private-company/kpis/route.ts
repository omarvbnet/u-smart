import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { normalizeProvince } from '@/lib/private-company-warehouse';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
  siteArrivalHours,
  taskDurationHours,
  ticketResubmissionHoursForKpi,
} from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

type StaffMeta = {
  id: string;
  name: string | null;
  username: string;
  role: string;
  province: string | null;
  departmentId: string | null;
  departmentName: string | null;
};

type ProvinceAgg = {
  province: string;
  ticketsAssigned: number;
  completedTickets: number;
  arrivalSumH: number;
  arrivalN: number;
  taskSumH: number;
  taskN: number;
  staffCount: number;
  resubmitSumH: number;
  resubmitN: number;
};

type StaffAgg = {
  ticketsAssigned: number;
  completedTickets: number;
  arrivalSumH: number;
  arrivalN: number;
  taskSumH: number;
  taskN: number;
  crewJoins: number;
  resubmitSumH: number;
  resubmitN: number;
};

function emptyAgg(): StaffAgg {
  return {
    ticketsAssigned: 0,
    completedTickets: 0,
    arrivalSumH: 0,
    arrivalN: 0,
    taskSumH: 0,
    taskN: 0,
    crewJoins: 0,
    resubmitSumH: 0,
    resubmitN: 0,
  };
}

function finalizeStaffRow(meta: StaffMeta, a: StaffAgg, days: number) {
  const avgTicketAssignmentsPerDay =
    days > 0 ? Math.round((a.ticketsAssigned / days) * 100) / 100 : 0;
  return {
    staffId: meta.id,
    name: meta.name?.trim() || meta.username,
    username: meta.username,
    role: meta.role,
    province: meta.province,
    departmentId: meta.departmentId,
    departmentName: meta.departmentName,
    ticketsAssigned: a.ticketsAssigned,
    completedTickets: a.completedTickets,
    avgTicketAssignmentsPerDay,
    totalTaskHours: Math.round(a.taskSumH * 100) / 100,
    avgTaskHours: a.taskN > 0 ? Math.round((a.taskSumH / a.taskN) * 100) / 100 : null,
    totalArrivalHours: Math.round(a.arrivalSumH * 100) / 100,
    avgArrivalHours: a.arrivalN > 0 ? Math.round((a.arrivalSumH / a.arrivalN) * 100) / 100 : null,
    crewJoins: a.crewJoins,
    totalResubmissionHours: Math.round(a.resubmitSumH * 100) / 100,
    avgResubmissionHours:
      a.resubmitN > 0 ? Math.round((a.resubmitSumH / a.resubmitN) * 100) / 100 : null,
  };
}

type DeptAgg = {
  departmentId: string | null;
  departmentName: string;
  ticketsAssigned: number;
  completedTickets: number;
  arrivalSumH: number;
  arrivalN: number;
  taskSumH: number;
  taskN: number;
  resubmitSumH: number;
  resubmitN: number;
};

/**
 * GET /api/provisor-private-company/kpis?days=180
 *
 * - Owner: department rollups + all staff rows (assigned private-company tickets only).
 * - Manager / Coordinator: flat staff KPIs for their department only (no department rollup table).
 * - Other staff: only their own KPI row.
 */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 });
  }
  const companyRow = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { id: true, status: true },
  });
  if (!companyRow || companyRow.status !== 'APPROVED') {
    return NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 });
  }

  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { id: true, role: true, privateCompanyDepartmentId: true, privateCompanyId: true },
  });
  if (!isOwner) {
    if (!me?.privateCompanyId || me.privateCompanyId !== m.effectiveCompanyId) {
      return NextResponse.json({ success: false, message: 'Not a member of this workspace.' }, { status: 403 });
    }
  }

  const role = String(me?.role ?? '').toUpperCase();
  const actorDepartmentId = me?.privateCompanyDepartmentId ?? null;

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get('days') ?? '365');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 7), 730) : 365;
  const provinceFilter = normalizeProvince(url.searchParams.get('province'));
  const since = new Date(Date.now() - days * 86400000);

  const [departments, staffList, tickets] = await Promise.all([
    prisma.privateCompanyDepartment.findMany({
      where: { companyId: m.effectiveCompanyId },
      select: { id: true, name: true },
    }),
    prisma.ticketRequester.findMany({
      where: { privateCompanyId: m.effectiveCompanyId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        province: true,
        privateCompanyDepartmentId: true,
      },
    }),
    prisma.visitorRequest.findMany({
      where: {
        privateCompanyId: m.effectiveCompanyId,
        assignmentScope: 'PRIVATE_COMPANY_STAFF',
        createdAt: { gte: since },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
        company: true,
      },
    }),
  ]);

  const deptName = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) {
    deptName.set(d.id, d.name);
  }

  const staffMeta = new Map<string, StaffMeta>();
  for (const s of staffList as Array<{
    id: string;
    name: string | null;
    username: string;
    role: string;
    province: string | null;
    privateCompanyDepartmentId: string | null;
  }>) {
    const did = s.privateCompanyDepartmentId;
    const prov =
      typeof s.province === 'string' && s.province.trim() ? s.province.trim() : null;
    staffMeta.set(s.id, {
      id: s.id,
      name: s.name,
      username: s.username,
      role: String(s.role ?? '').toUpperCase(),
      province: prov,
      departmentId: did,
      departmentName: did ? deptName.get(did) ?? null : null,
    });
  }

  const staffIdsInProvince = provinceFilter
    ? new Set(
        [...staffMeta.values()]
          .filter((m) => m.province === provinceFilter)
          .map((m) => m.id)
      )
    : null;

  const ticketIds = (tickets as Array<{ id: string }>).map((t) => t.id);
  const logsByTicket = new Map<string, Array<{ status: string; createdAt: Date }>>();
  if (ticketIds.length > 0) {
    const logs = await prisma.ticketStatusLog.findMany({
      where: { visitorRequestId: { in: ticketIds } },
      select: { visitorRequestId: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of logs as Array<{ visitorRequestId: string; status: string; createdAt: Date }>) {
      const arr = logsByTicket.get(row.visitorRequestId) ?? [];
      arr.push({ status: row.status, createdAt: row.createdAt });
      logsByTicket.set(row.visitorRequestId, arr);
    }
  }

  const perStaff = new Map<string, StaffAgg>();
  const perDept = new Map<string | null, DeptAgg>();
  const perProvince = new Map<string, ProvinceAgg>();
  const staffSeenInProvince = new Map<string, Set<string>>();

  function ensureProvince(prov: string): ProvinceAgg {
    const key = prov;
    if (!perProvince.has(key)) {
      perProvince.set(key, {
        province: key,
        ticketsAssigned: 0,
        completedTickets: 0,
        arrivalSumH: 0,
        arrivalN: 0,
        taskSumH: 0,
        taskN: 0,
        staffCount: 0,
        resubmitSumH: 0,
        resubmitN: 0,
      });
      staffSeenInProvince.set(key, new Set());
    }
    return perProvince.get(key)!;
  }

  function ensureDept(did: string | null, dname: string) {
    if (!perDept.has(did)) {
      perDept.set(did, {
        departmentId: did,
        departmentName: dname,
        ticketsAssigned: 0,
        completedTickets: 0,
        arrivalSumH: 0,
        arrivalN: 0,
        taskSumH: 0,
        taskN: 0,
        resubmitSumH: 0,
        resubmitN: 0,
      });
    }
    return perDept.get(did)!;
  }

  function bumpResubmit(agg: StaffAgg | DeptAgg | ProvinceAgg, hours: number) {
    agg.resubmitSumH += hours;
    agg.resubmitN += 1;
  }

  for (const t of tickets as Array<{
    id: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    company: string | null;
  }>) {
    const parsed = parseTicketCompanyJson(t.company);
    const assigneeId = assignedStaffIdFromCompanyJson(parsed);
    if (!assigneeId) continue;
    if (staffIdsInProvince && !staffIdsInProvince.has(assigneeId)) continue;

    const logs = logsByTicket.get(t.id) ?? [];
    const arrh = siteArrivalHours(t.createdAt, logs);
    const taskh = taskDurationHours(t.status, t.completedAt, logs);
    const resubh = ticketResubmissionHoursForKpi(parsed);

    const a = perStaff.get(assigneeId) ?? emptyAgg();
    a.ticketsAssigned += 1;
    if (String(t.status).toUpperCase() === 'COMPLETED') a.completedTickets += 1;
    if (arrh != null && arrh >= 0) {
      a.arrivalSumH += arrh;
      a.arrivalN += 1;
    }
    if (taskh != null && taskh >= 0) {
      a.taskSumH += taskh;
      a.taskN += 1;
    }
    if (resubh != null && resubh >= 0) {
      bumpResubmit(a, resubh);
    }
    perStaff.set(assigneeId, a);

    for (const crewId of maintenanceCrewIdsFromCompanyJson(parsed)) {
      if (staffIdsInProvince && !staffIdsInProvince.has(crewId)) continue;
      const c = perStaff.get(crewId) ?? emptyAgg();
      c.crewJoins += 1;
      perStaff.set(crewId, c);
    }

    const meta = staffMeta.get(assigneeId);
    const dId = meta?.departmentId ?? null;
    const dLabel = meta?.departmentName?.trim() || (dId ? 'Department' : 'Unassigned');
    const d = ensureDept(dId, dLabel);
    d.ticketsAssigned += 1;
    if (String(t.status).toUpperCase() === 'COMPLETED') d.completedTickets += 1;
    if (arrh != null && arrh >= 0) {
      d.arrivalSumH += arrh;
      d.arrivalN += 1;
    }
    if (taskh != null && taskh >= 0) {
      d.taskSumH += taskh;
      d.taskN += 1;
    }
    if (resubh != null && resubh >= 0) {
      bumpResubmit(d, resubh);
    }

    const prov = meta?.province;
    if (prov) {
      const p = ensureProvince(prov);
      p.ticketsAssigned += 1;
      if (String(t.status).toUpperCase() === 'COMPLETED') p.completedTickets += 1;
      if (arrh != null && arrh >= 0) {
        p.arrivalSumH += arrh;
        p.arrivalN += 1;
      }
      if (taskh != null && taskh >= 0) {
        p.taskSumH += taskh;
        p.taskN += 1;
      }
      if (resubh != null && resubh >= 0) {
        bumpResubmit(p, resubh);
      }
      const seen = staffSeenInProvince.get(prov)!;
      if (!seen.has(assigneeId)) {
        seen.add(assigneeId);
        p.staffCount += 1;
      }
    }
  }

  let scope: 'workspace' | 'department' | 'self';
  let byStaffRaw: Array<ReturnType<typeof finalizeStaffRow>> = [];

  if (isOwner) {
    scope = 'workspace';
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg, days));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
    if (provinceFilter) {
      byStaffRaw = byStaffRaw.filter((r) => r.province === provinceFilter);
    }
  } else if (MANAGER_ROLES.has(role) && actorDepartmentId) {
    scope = 'department';
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta || meta.departmentId !== actorDepartmentId) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg, days));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
    if (provinceFilter) {
      byStaffRaw = byStaffRaw.filter((r) => r.province === provinceFilter);
    }
  } else {
    scope = 'self';
    const selfId = auth.payload.requesterId;
    const meta = staffMeta.get(selfId);
    if (meta) {
      byStaffRaw = [finalizeStaffRow(meta, perStaff.get(selfId) ?? emptyAgg(), days)];
    } else {
      byStaffRaw = [];
    }
  }

  let byDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    ticketsAssigned: number;
    completedTickets: number;
    avgTicketAssignmentsPerDay: number;
    totalTaskHours: number;
    avgTaskHours: number | null;
    totalArrivalHours: number;
    avgArrivalHours: number | null;
  }> = [];

  if (isOwner) {
    byDepartment = [...perDept.values()]
      .map((d) => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        ticketsAssigned: d.ticketsAssigned,
        completedTickets: d.completedTickets,
        avgTicketAssignmentsPerDay:
          days > 0 ? Math.round((d.ticketsAssigned / days) * 100) / 100 : 0,
        totalTaskHours: Math.round(d.taskSumH * 100) / 100,
        avgTaskHours: d.taskN > 0 ? Math.round((d.taskSumH / d.taskN) * 100) / 100 : null,
        totalArrivalHours: Math.round(d.arrivalSumH * 100) / 100,
        avgArrivalHours: d.arrivalN > 0 ? Math.round((d.arrivalSumH / d.arrivalN) * 100) / 100 : null,
        totalResubmissionHours: Math.round(d.resubmitSumH * 100) / 100,
        avgResubmissionHours:
          d.resubmitN > 0 ? Math.round((d.resubmitSumH / d.resubmitN) * 100) / 100 : null,
      }))
      .sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
  }

  const byProvince = [...perProvince.values()]
    .map((p) => ({
      province: p.province,
      staffCount: p.staffCount,
      ticketsAssigned: p.ticketsAssigned,
      completedTickets: p.completedTickets,
      avgTicketAssignmentsPerDay:
        days > 0 ? Math.round((p.ticketsAssigned / days) * 100) / 100 : 0,
      totalTaskHours: Math.round(p.taskSumH * 100) / 100,
      avgTaskHours: p.taskN > 0 ? Math.round((p.taskSumH / p.taskN) * 100) / 100 : null,
      totalArrivalHours: Math.round(p.arrivalSumH * 100) / 100,
      avgArrivalHours:
        p.arrivalN > 0 ? Math.round((p.arrivalSumH / p.arrivalN) * 100) / 100 : null,
      totalResubmissionHours: Math.round(p.resubmitSumH * 100) / 100,
      avgResubmissionHours:
        p.resubmitN > 0 ? Math.round((p.resubmitSumH / p.resubmitN) * 100) / 100 : null,
    }))
    .sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);

  return NextResponse.json({
    success: true,
    scope,
    days,
    provinceFilter,
    ticketSampleSize: tickets.length,
    byDepartment,
    byProvince,
    byStaff: byStaffRaw,
    legend: {
      taskHours:
        'Per completed ticket: hours from first ON_SITE/IN_PROGRESS log to completion.',
      arrivalHours: 'Per ticket: hours from ticket creation until first ON_SITE/IN_PROGRESS log.',
      resubmissionHours:
        'Per ticket with resubmit cycles: total hours staff waited for requester edits (closed cycles + open pending).',
      avgTicketAssignmentsPerDay:
        'Assigned ticket count in the window divided by the number of calendar days in the window (smooth workload rate).',
    },
  });
}
