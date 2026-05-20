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
import {
  loadCancellationSettings,
  serializeCancellationSettings,
} from '@/lib/private-company-cancellations';
import { CANCELLATION_REASON_KEY, readCancellationFromParsed } from '@/lib/ticket-cancellation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function getSiteDelegate() {
  return (prisma as { site?: { findMany: (args: unknown) => Promise<unknown[]> } }).site;
}

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

function finalizeStaffRow(
  meta: StaffMeta,
  a: StaffAgg
): {
  staffId: string;
  name: string;
  username: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  ticketsAssigned: number;
  completedTickets: number;
  totalTaskHours: number;
  avgTaskHours: number | null;
  totalArrivalHours: number;
  avgArrivalHours: number | null;
} {
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
 * GET /api/provisor-private-company/export?days=365
 *
 * JSON bundle: sites (owner account), staff, workspace tickets, ticket summary, KPIs.
 * - Owner (COMPANY): full workspace.
 * - Manager / Coordinator: same categories scoped to their department (staff list, tickets
 *   involving department members as assignee or requester, sites referenced by those tickets).
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
    select: {
      id: true,
      name: true,
      status: true,
      ownerRequesterId: true,
      ticketCancellationReasons: true,
    },
  });
  if (!companyRow || companyRow.status !== 'APPROVED') {
    return NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      role: true,
      privateCompanyDepartmentId: true,
      privateCompanyId: true,
    },
  });

  const isOwner = m.ownedCompanyId === m.effectiveCompanyId;
  const role = String(me?.role ?? '').toUpperCase();
  const actorDepartmentId = me?.privateCompanyDepartmentId ?? null;

  const canExport =
    isOwner ||
    (me?.privateCompanyId === m.effectiveCompanyId && MANAGER_ROLES.has(role) && !!actorDepartmentId);

  if (!canExport) {
    return NextResponse.json(
      { success: false, message: 'Export is only available to the workspace owner or department managers.' },
      { status: 403 }
    );
  }

  if (!isOwner && MANAGER_ROLES.has(role) && !actorDepartmentId) {
    return NextResponse.json(
      { success: false, message: 'Assign a department to your account before exporting.' },
      { status: 403 }
    );
  }

  const daysRaw = Number(new URL(req.url).searchParams.get('days') ?? '365');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 7), 730) : 365;
  const since = new Date(Date.now() - days * 86400000);

  const scope: 'workspace' | 'department' = isOwner ? 'workspace' : 'department';

  const [departments, staffAll, ticketsRaw] = await Promise.all([
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
        email: true,
        phone: true,
        role: true,
        specialization: true,
        status: true,
        province: true,
        provinceFilterActive: true,
        privateCompanyDepartmentId: true,
        createdAt: true,
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
        siteName: true,
        siteCoordinator: true,
        technique: true,
        serviceSlug: true,
        status: true,
        createdAt: true,
        completedAt: true,
        company: true,
        requesterId: true,
        province: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const deptName = new Map<string, string>();
  for (const d of departments as Array<{ id: string; name: string }>) {
    deptName.set(d.id, d.name);
  }

  const staffMeta = new Map<string, StaffMeta>();
  for (const s of staffAll as Array<{
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

  let deptStaffIds = new Set<string>();
  if (scope === 'department' && actorDepartmentId) {
    for (const s of staffAll as Array<{ id: string; privateCompanyDepartmentId: string | null }>) {
      if (s.privateCompanyDepartmentId === actorDepartmentId) deptStaffIds.add(s.id);
    }
  }

  function ticketInScope(t: {
    company: string | null;
    requesterId: string | null;
  }): boolean {
    if (scope === 'workspace') return true;
    const assignee = assignedStaffIdFromCompanyJson(parseTicketCompanyJson(t.company));
    if (assignee && deptStaffIds.has(assignee)) return true;
    if (t.requesterId && deptStaffIds.has(t.requesterId)) return true;
    return false;
  }

  const tickets = (ticketsRaw as typeof ticketsRaw).filter(ticketInScope);

  const staffExport =
    scope === 'workspace'
      ? staffAll
      : (staffAll as typeof staffAll).filter(
          (s: { privateCompanyDepartmentId: string | null }) =>
            s.privateCompanyDepartmentId === actorDepartmentId
        );

  const siteNamesFromTickets = new Set<string>();
  for (const t of tickets as Array<{ siteName: string | null; company: string | null }>) {
    let sn = t.siteName?.trim() || '';
    if (!sn) {
      const p = parseTicketCompanyJson(t.company);
      const fromJson = p.siteName;
      if (typeof fromJson === 'string' && fromJson.trim()) sn = fromJson.trim();
    }
    if (sn) siteNamesFromTickets.add(sn);
  }

  let sitesExport: Array<{
    id: string;
    siteId: string;
    location: string;
    province: string;
    latitude: number | null;
    longitude: number | null;
    updatedAt: string | null;
  }> = [];

  const siteDelegate = getSiteDelegate();
  if (siteDelegate?.findMany) {
    const ownerId = companyRow.ownerRequesterId as string;
    const ownedSites = (await siteDelegate.findMany({
      where: { requesterId: ownerId },
      select: {
        id: true,
        siteId: true,
        location: true,
        province: true,
        latitude: true,
        longitude: true,
        updatedAt: true,
      },
    })) as Array<{
      id: string;
      siteId: string;
      location: string;
      province: string;
      latitude: number | null;
      longitude: number | null;
      updatedAt: Date;
    }>;

    const filtered =
      scope === 'workspace'
        ? ownedSites
        : ownedSites.filter((s) => siteNamesFromTickets.has(s.siteId));

    sitesExport = filtered.map((s) => ({
      id: s.id,
      siteId: s.siteId,
      location: s.location,
      province: s.province,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      updatedAt: s.updatedAt?.toISOString() ?? null,
    }));
  }

  const ticketIdsForLogs = (ticketsRaw as Array<{ id: string }>).map((t) => t.id);
  const logsByTicket = new Map<string, Array<{ status: string; createdAt: Date }>>();
  if (ticketIdsForLogs.length > 0) {
    const logs = await prisma.ticketStatusLog.findMany({
      where: { visitorRequestId: { in: ticketIdsForLogs } },
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

  for (const t of ticketsRaw as Array<{
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

  let byStaffRaw: ReturnType<typeof finalizeStaffRow>[] = [];
  if (scope === 'workspace') {
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
  } else {
    for (const [id, agg] of perStaff) {
      const meta = staffMeta.get(id);
      if (!meta || meta.departmentId !== actorDepartmentId) continue;
      byStaffRaw.push(finalizeStaffRow(meta, agg));
    }
    byStaffRaw.sort((a, b) => b.ticketsAssigned - a.ticketsAssigned);
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

  if (scope === 'workspace') {
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
  } else if (actorDepartmentId) {
    const d = perDept.get(actorDepartmentId);
    if (d) {
      byDepartment = [
        {
          departmentId: d.departmentId,
          departmentName: d.departmentName,
          ticketsAssigned: d.ticketsAssigned,
          completedTickets: d.completedTickets,
          totalTaskHours: Math.round(d.taskSumH * 100) / 100,
          avgTaskHours: d.taskN > 0 ? Math.round((d.taskSumH / d.taskN) * 100) / 100 : null,
          totalArrivalHours: Math.round(d.arrivalSumH * 100) / 100,
          avgArrivalHours: d.arrivalN > 0 ? Math.round((d.arrivalSumH / d.arrivalN) * 100) / 100 : null,
        },
      ];
    }
  }

  const ticketSummary: Record<string, number> = {};
  for (const t of tickets as Array<{ status: string }>) {
    const k = String(t.status).toUpperCase();
    ticketSummary[k] = (ticketSummary[k] ?? 0) + 1;
  }

  const ticketsLite = (tickets as Array<{
    id: string;
    siteName: string | null;
    siteCoordinator: string | null;
    technique: string;
    serviceSlug: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
    company: string | null;
    requesterId: string | null;
    province: string;
  }>).map((t) => {
    const parsed = parseTicketCompanyJson(t.company);
    const assignee = assignedStaffIdFromCompanyJson(parsed);
    let siteName = t.siteName?.trim() || '';
    if (!siteName && typeof parsed.siteName === 'string') siteName = parsed.siteName.trim();
    return {
      id: t.id,
      siteName: siteName || null,
      siteCoordinator: t.siteCoordinator,
      technique: t.technique,
      serviceSlug: t.serviceSlug,
      status: String(t.status).toUpperCase(),
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      requesterId: t.requesterId,
      assignedStaffId: assignee,
      province: t.province,
    };
  });

  const cancellationReasons = serializeCancellationSettings({
    ticketCancellationReasons: companyRow.ticketCancellationReasons ?? [],
  }).reasons;

  const cancellationByReason = new Map<string, number>();
  for (const t of tickets as Array<{ id: string; status: string; company: string | null }>) {
    if (String(t.status).toUpperCase() !== 'CANCELLED') continue;
    const parsed = parseTicketCompanyJson(t.company);
    const cancel = readCancellationFromParsed(parsed);
    const reason =
      (cancel.cancellationReason?.trim() ||
        (typeof parsed[CANCELLATION_REASON_KEY] === 'string'
          ? String(parsed[CANCELLATION_REASON_KEY]).trim()
          : '')) ||
      'Unknown';
    cancellationByReason.set(reason, (cancellationByReason.get(reason) ?? 0) + 1);
  }
  const cancellationAnalytics = {
    totalCancelled: [...cancellationByReason.values()].reduce((s, n) => s + n, 0),
    byReason: [...cancellationByReason.entries()]
      .map(([reason, ticketCount]) => ({ reason, ticketCount }))
      .sort((a, b) => b.ticketCount - a.ticketCount),
  };

  const payload = {
    success: true,
    exportedAt: new Date().toISOString(),
    workspace: { id: companyRow.id, name: companyRow.name },
    exportScope: scope,
    days,
    sites: sitesExport,
    staff: staffExport,
    tickets: ticketsLite,
    ticketSummary,
    cancellation: {
      reasons: cancellationReasons,
      analytics: cancellationAnalytics,
    },
    performance: {
      ticketCount: tickets.length,
      ticketSummary,
    },
    kpis: {
      days,
      ticketSampleSize: (ticketsRaw as Array<unknown>).length,
      byDepartment,
      byStaff: byStaffRaw,
      legend: {
        taskHours:
          'Per completed ticket: hours from first ON_SITE/IN_PROGRESS log to completion.',
        arrivalHours: 'Per ticket: hours from ticket creation until first ON_SITE/IN_PROGRESS log.',
      },
    },
  };

  const body = JSON.stringify(payload, null, 2);
  const safeName = String(companyRow.name ?? 'workspace')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const fname = `private-workspace-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
