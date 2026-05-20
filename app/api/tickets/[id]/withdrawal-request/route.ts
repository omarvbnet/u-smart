import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { shouldDeferOnSiteUntilArrival } from '@/lib/workspace-site-arrival';
import { isWorkspaceEngineerRole } from '@/lib/workspace-task-assignment';
import {
  readWithdrawalRequest,
  withdrawalRequesterRole,
  writeWithdrawalRequest,
} from '@/lib/ticket-field-withdrawal';

const prisma = _prisma as any;

async function notifyDispatchersWithdrawalRequested(
  ticket: {
    id: string;
    privateCompanyId: string;
    privateCompanyTargetDepartmentId: string | null;
    company: string | null;
  },
  requester: { id: string; name: string | null; username: string | null },
  reason: string
) {
  const parsed = parseTicketCompanyJson(ticket.company);
  const leadId = assignedStaffIdFromCompanyJson(parsed);
  const recipients = new Set<string>();

  if (leadId) {
    const lead = await prisma.ticketRequester.findUnique({
      where: { id: leadId },
      select: { id: true, role: true, status: true },
    });
    if (
      lead?.id &&
      (lead.status ?? 'ACTIVE') === 'ACTIVE' &&
      isWorkspaceEngineerRole(lead.role as string)
    ) {
      recipients.add(lead.id);
    }
  }

  const deptId = ticket.privateCompanyTargetDepartmentId;
  if (deptId) {
    const dispatchers = await prisma.ticketRequester.findMany({
      where: {
        privateCompanyId: ticket.privateCompanyId,
        status: 'ACTIVE',
        privateCompanyDepartmentId: deptId,
        role: { in: ['ENGINEER', 'MANAGER', 'COORDINATOR'] },
      },
      select: { id: true },
    });
    for (const d of dispatchers as Array<{ id: string }>) {
      recipients.add(d.id);
    }
  }

  const name = requester.name || requester.username || requester.id;
  for (const rid of recipients) {
    if (rid === requester.id) continue;
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId: ticket.id,
        requesterId: rid,
        payload: {
          key: 'ticket_withdrawal_requested',
          vars: { name, ticketId: ticket.id, reason: reason || '—' },
        },
        data: { ticketId: ticket.id, type: 'withdrawal_requested' },
      });
    } catch {
      /* ignore */
    }
  }
}

async function assignReplacementTechnician(
  ticketId: string,
  row: {
    id: string;
    technique: string | null;
    province: string | null;
    privateCompanyId: string;
    assignmentScope: string | null;
    privateCompanyTargetDepartmentId: string | null;
    company: string | null;
    requesterId: string | null;
  },
  replacementId: string,
  dispatcherId: string
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const targetDeptId = row.privateCompanyTargetDepartmentId?.trim() || '';
  if (!targetDeptId) {
    return { ok: false, message: 'Ticket has no target department.', status: 400 };
  }
  const assignee = await prisma.ticketRequester.findFirst({
    where: {
      id: replacementId,
      privateCompanyId: row.privateCompanyId,
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      privateCompanyDepartmentId: targetDeptId,
    },
    select: { id: true, name: true, username: true, province: true, provinceFilterActive: true },
  });
  if (!assignee) {
    return { ok: false, message: 'Replacement technician not found in this department.', status: 404 };
  }
  const ticketProvince = (row as { province?: string | null }).province ?? '';
  const ap = (assignee.province ?? '').trim();
  const filterActive = assignee.provinceFilterActive !== false;
  if (
    filterActive &&
    ap &&
    ticketProvince &&
    ap.toLowerCase() !== String(ticketProvince).trim().toLowerCase()
  ) {
    return {
      ok: false,
      message: 'Replacement technician province does not match this ticket.',
      status: 400,
    };
  }

  let parsed: Record<string, unknown> = parseTicketCompanyJson(row.company) as Record<string, unknown>;
  const newStatus = await (async () => {
    const defer = await shouldDeferOnSiteUntilArrival(prisma, row, targetDeptId);
    return defer ? 'PENDING' : 'ON_SITE';
  })();

  parsed.assignedEngineerId = assignee.id;
  parsed.assignedEngineerName = assignee.name || assignee.username;
  parsed.assignedAt = new Date().toISOString();
  parsed.status = newStatus;
  parsed.awaitingSiteArrival = newStatus === 'PENDING';
  if (!parsed._ticket) parsed._ticket = true;
  writeWithdrawalRequest(parsed, null);

  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { status: newStatus, company: JSON.stringify(parsed) },
  });
  if (newStatus === 'ON_SITE') {
    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: ticketId, status: newStatus },
      });
    } catch {
      /* ignore */
    }
  }

  try {
    await notifyRequesterI18n({
      prisma,
      type: 'status_changed',
      ticketId,
      requesterId: assignee.id,
      payload: {
        key: 'staff_assigned',
        vars: {
          staffKind: 'technician',
          assigneeName: assignee.name || assignee.username || '',
        },
      },
      data: { ticketId, type: 'status_changed' },
    });
  } catch {
    /* ignore */
  }

  return { ok: true };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const { id: ticketId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { id: true, role: true, name: true, username: true, privateCompanyId: true },
  });
  if (!me || String(me.role ?? '').toUpperCase() !== 'TECHNICIAN') {
    return NextResponse.json(
      { success: false, message: 'Only technicians can request withdrawal from a ticket.' },
      { status: 403 },
    );
  }

  const row = await prisma.visitorRequest.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      company: true,
      status: true,
      privateCompanyId: true,
      assignmentScope: true,
      privateCompanyTargetDepartmentId: true,
    },
  });
  if (!row || row.privateCompanyId !== me.privateCompanyId) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }
  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    return NextResponse.json({ success: false, message: 'Ticket is completed.' }, { status: 400 });
  }

  const role = withdrawalRequesterRole(me.id, row.company);
  if (!role) {
    return NextResponse.json(
      { success: false, message: 'You are not assigned to this ticket.' },
      { status: 403 },
    );
  }
  const existing = readWithdrawalRequest(row.company);
  if (existing?.status === 'PENDING') {
    return NextResponse.json(
      { success: false, message: 'A withdrawal request is already pending.' },
      { status: 400 },
    );
  }

  const parsed = parseTicketCompanyJson(row.company) as Record<string, unknown>;
  writeWithdrawalRequest(parsed, {
    requestedBy: me.id,
    requestedByName: me.name || me.username || me.id,
    requestedAt: new Date().toISOString(),
    reason: reason || undefined,
    status: 'PENDING',
    role,
  });
  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });

  await notifyDispatchersWithdrawalRequested(
    {
      id: ticketId,
      privateCompanyId: row.privateCompanyId as string,
      privateCompanyTargetDepartmentId: row.privateCompanyTargetDepartmentId ?? null,
      company: row.company,
    },
    me,
    reason
  );

  return NextResponse.json({
    success: true,
    withdrawalRequest: readWithdrawalRequest(JSON.stringify(parsed)),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const { id: ticketId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json(
      { success: false, message: 'action must be accept or reject.' },
      { status: 400 },
    );
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      privateCompanyId: true,
      privateCompanyDepartmentId: true,
    },
  });
  if (!me) {
    return NextResponse.json({ success: false, message: 'Not authenticated.' }, { status: 401 });
  }
  const roleUpper = String(me.role ?? '').toUpperCase();
  const canDispatch =
    isWorkspaceEngineerRole(me.role) || roleUpper === 'MANAGER' || roleUpper === 'COORDINATOR';
  if (!canDispatch) {
    return NextResponse.json(
      { success: false, message: 'Only engineers, managers, or coordinators can respond.' },
      { status: 403 },
    );
  }

  const row = await prisma.visitorRequest.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      company: true,
      status: true,
      technique: true,
      province: true,
      privateCompanyId: true,
      assignmentScope: true,
      privateCompanyTargetDepartmentId: true,
      requesterId: true,
    },
  });
  if (!row || row.privateCompanyId !== me.privateCompanyId) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }

  const withdrawal = readWithdrawalRequest(row.company);
  if (!withdrawal || withdrawal.status !== 'PENDING') {
    return NextResponse.json(
      { success: false, message: 'No pending withdrawal request on this ticket.' },
      { status: 400 },
    );
  }

  const targetDept = row.privateCompanyTargetDepartmentId ?? null;
  const myDept = me.privateCompanyDepartmentId ?? null;
  if (targetDept && myDept && targetDept !== myDept && roleUpper !== 'MANAGER') {
    return NextResponse.json(
      { success: false, message: 'This ticket belongs to another department.' },
      { status: 403 },
    );
  }

  if (action === 'reject') {
    const parsed = parseTicketCompanyJson(row.company) as Record<string, unknown>;
    writeWithdrawalRequest(parsed, {
      ...withdrawal,
      status: 'REJECTED',
      resolvedBy: me.id,
      resolvedAt: new Date().toISOString(),
    });
    await prisma.visitorRequest.update({
      where: { id: ticketId },
      data: { company: JSON.stringify(parsed) },
    });
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId,
        requesterId: withdrawal.requestedBy,
        payload: { key: 'ticket_withdrawal_rejected', vars: { ticketId } },
        data: { ticketId, type: 'withdrawal_rejected' },
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ success: true, action: 'reject' });
  }

  const replacementId =
    typeof body?.replacementRequesterId === 'string' ? body.replacementRequesterId.trim() : '';

  if (withdrawal.role === 'LEAD') {
    if (!replacementId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Accepting withdrawal requires replacementRequesterId (another technician).',
        },
        { status: 400 },
      );
    }
    const assignRes = await assignReplacementTechnician(
      ticketId,
      row as {
        id: string;
        technique: string | null;
        province: string | null;
        privateCompanyId: string;
        assignmentScope: string | null;
        privateCompanyTargetDepartmentId: string | null;
        company: string | null;
        requesterId: string | null;
      },
      replacementId,
      me.id
    );
    if (!assignRes.ok) {
      return NextResponse.json(
        { success: false, message: assignRes.message },
        { status: assignRes.status },
      );
    }
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'status_changed',
        ticketId,
        requesterId: withdrawal.requestedBy,
        payload: { key: 'ticket_withdrawal_accepted', vars: { ticketId } },
        data: { ticketId, type: 'withdrawal_accepted' },
      });
    } catch {
      /* ignore */
    }
    return NextResponse.json({ success: true, action: 'accept', assignedEngineerId: replacementId });
  }

  const parsed = parseTicketCompanyJson(row.company) as Record<string, unknown>;
  let crew = maintenanceCrewIdsFromCompanyJson(parsed);
  crew = crew.filter((x) => x !== withdrawal.requestedBy);
  parsed.maintenanceCrewIds = crew;
  writeWithdrawalRequest(parsed, null);
  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });
  try {
    await notifyRequesterI18n({
      prisma,
      type: 'status_changed',
      ticketId,
      requesterId: withdrawal.requestedBy,
      payload: { key: 'ticket_withdrawal_accepted', vars: { ticketId } },
      data: { ticketId, type: 'withdrawal_accepted' },
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ success: true, action: 'accept', maintenanceCrewIds: crew });
}
