import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import {
  assignedStaffIdFromCompanyJson,
  parseTicketCompanyJson,
  siteArrivalHours,
  taskDurationHours,
} from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

type StaffMeta = {
  id: string;
  name: string | null;
  username: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
};

type StaffAgg = {
  ticketsAssigned: number;
  completedTickets: number;
  arrivalSumH: number;
  arrivalN: number;
  taskSumH: number;
  taskN: number;
};

function emptyAgg(): StaffAgg {
  return {
    ticketsAssigned: 0,
    completedTickets: 0,
    arrivalSumH: 0,
    arrivalN: 0,
    taskSumH: 0,
    taskN: 0,
  };
}

function finalizeStaffRow(meta: StaffMeta, a: StaffAgg) {
  return {
    staffId: meta.id,
    name: meta.name?.trim() || meta.username,
    username: meta.username,
    role: meta.role,
    departmentId: meta.departmentId,
    departmentName: meta.departmentName,
    ticketsAssigned: a.ticketsAssigned,
    completedTickets: a.completedTickets,
    totalTaskHours: Math.round(a.taskSumH * 100) / 100,
    avgTaskHours: a.taskN > 0 ? Math.round((a.taskSumH / a.taskN) * 100) / 100 : null,
    totalArrivalHours: Math.round(a.arrivalSumH * 100) / 100,
    avgArrivalHours: a.arrivalN > 0 ? Math.round((a.arrivalSumH / a.arrivalN) * 100) / 100 : null,
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

  const daysRaw = Number(new URL(req.url).searchParams.get('days') ?? '365');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 7), 730) : 365;
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
    privateCompanyDepartmentId: string | null;
  }>) {
    const did = s.privateCompanyDepartmentId;
    staffMeta.set(s.id, {
      id: s.id,
      name: s.name,
      username: s.username,
      role: String(s.role ?? '').toUpperCase(),
      departmentId: did,
      departmentName: did ? deptName.get(did) ?? null : null,
    });
  }

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
      });
    }
    return perDept.get(did)!;
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

    const logs = logsByTicket.get(t.id) ?? [];
    const arrh = siteArrivalHours(t.createdAt, logs);
    const taskh = taskDurationHours(t.status, t.completedAt, logs);

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
    perStaff.set(assigneeId, a);

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
  }

  let scope: 'workspace' | 'department' | 'self';
  let byStaffRaw: Array<ReturnType<typeof finalizeStaffRow>> = [];

  if (isOwner) {
    scope = 'workspace';
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
  } else if (MANAGER_ROLES.has(role) && actorDepartmentId) {
    scope = 'department';
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta || meta.departmentId !== actorDepartmentId) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
  } else {
    scope = 'self';
    const selfId = auth.payload.requesterId;
    const meta = staffMeta.get(selfId);
    if (meta) {
      byStaffRaw = [finalizeStaffRow(meta, perStaff.get(selfId) ?? emptyAgg())];
    } else {
      byStaffRaw = [];
    }
  }

  let byDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    ticketsAssigned: number;
    completedTickets: number;
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
        totalTaskHours: Math.round(d.taskSumH * 100) / 100,
        avgTaskHours: d.taskN > 0 ? Math.round((d.taskSumH / d.taskN) * 100) / 100 : null,
        totalArrivalHours: Math.round(d.arrivalSumH * 100) / 100,
        avgArrivalHours: d.arrivalN > 0 ? Math.round((d.arrivalSumH / d.arrivalN) * 100) / 100 : null,
      }))
      .sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
  }

  return NextResponse.json({
    success: true,
    scope,
    days,
    ticketSampleSize: tickets.length,
    byDepartment,
    byStaff: byStaffRaw,
    legend: {
      taskHours:
        'Per completed ticket: hours from first ON_SITE/IN_PROGRESS log to completion.',
      arrivalHours: 'Per ticket: hours from ticket creation until first ON_SITE/IN_PROGRESS log.',
    },
  });
}
