import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  CAN_SUBMIT_TICKET_EXPENSE_ROLES,
  canStaffSubmitExpenseOnTicket,
  expenseRowToJson,
  expensesGuard,
  loadExpenseSettings,
  parseExpenseAmount,
} from '@/lib/private-company-expenses';
import { normalizeProvince } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

/**
 * GET /api/provisor-private-company/expenses?days=90&province=&departmentId=&staffId=&ticketId=
 * POST body: { ticketId, amount, reason, note?, currency? }
 */
export async function GET(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get('days') ?? '90');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 730) : 90;
  const since = new Date(Date.now() - days * 86400000);
  const provinceFilter = normalizeProvince(url.searchParams.get('province'));
  const departmentId = url.searchParams.get('departmentId')?.trim() || null;
  const staffId = url.searchParams.get('staffId')?.trim() || null;
  const ticketId = url.searchParams.get('ticketId')?.trim() || null;

  const where: Record<string, unknown> = {
    companyId: guard.companyId,
    createdAt: { gte: since },
  };
  if (ticketId) where.ticketId = ticketId;
  if (staffId) where.staffRequesterId = staffId;
  if (provinceFilter) where.ticketProvince = provinceFilter;
  if (departmentId) where.departmentId = departmentId;

  if (!guard.isOwner && MANAGER_ROLES.has(guard.actorRole) && guard.actorDepartmentId) {
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only view expenses for your department.' },
        { status: 403 }
      );
    }
    if (!departmentId) where.departmentId = guard.actorDepartmentId;
  } else if (!guard.isOwner && !MANAGER_ROLES.has(guard.actorRole)) {
    where.staffRequesterId = guard.requesterId;
  }

  const rows = await prisma.privateCompanyTicketExpense.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      staff: { select: { id: true, name: true, username: true } },
      ticket: {
        select: {
          id: true,
          siteName: true,
          technique: true,
          status: true,
          province: true,
        },
      },
    },
  });

  const totalAmount = rows.reduce((s: number, r: { amount: number }) => s + r.amount, 0);

  return NextResponse.json({
    success: true,
    days,
    provinceFilter,
    departmentId: (where.departmentId as string | undefined) ?? departmentId,
    staffId: (where.staffRequesterId as string | undefined) ?? staffId,
    ticketId,
    totalAmount: Math.round(totalAmount * 100) / 100,
    count: rows.length,
    expenses: rows.map(expenseRowToJson),
  });
}

export async function POST(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;

  if (!guard.isOwner && !CAN_SUBMIT_TICKET_EXPENSE_ROLES.has(guard.actorRole)) {
    return NextResponse.json(
      { success: false, message: 'Your role cannot submit ticket expenses.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const ticketId = typeof body?.ticketId === 'string' ? body.ticketId.trim() : '';
  if (!ticketId) {
    return NextResponse.json({ success: false, message: 'ticketId is required.' }, { status: 400 });
  }

  const amount = parseExpenseAmount(body?.amount);
  if (amount == null) {
    return NextResponse.json(
      { success: false, message: 'amount must be a positive number.' },
      { status: 400 }
    );
  }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 200) {
    return NextResponse.json({ success: false, message: 'reason is required.' }, { status: 400 });
  }

  const settings = await loadExpenseSettings(guard.companyId);
  const allowedReasons = Array.isArray(settings?.ticketExpenseReasons)
    ? (settings.ticketExpenseReasons as string[]).map((s) => s.trim()).filter(Boolean)
    : [];
  if (allowedReasons.length > 0) {
    const hit = allowedReasons.find((r) => r.toLowerCase() === reason.toLowerCase());
    if (!hit) {
      return NextResponse.json(
        {
          success: false,
          message: `reason must be one of: ${allowedReasons.join(', ')}`,
        },
        { status: 400 }
      );
    }
  }

  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
  const currency =
    typeof body?.currency === 'string' && body.currency.trim()
      ? body.currency.trim().slice(0, 8).toUpperCase()
      : 'IQD';

  const ticket = await prisma.visitorRequest.findFirst({
    where: { id: ticketId, privateCompanyId: guard.companyId },
    select: {
      id: true,
      status: true,
      company: true,
      privateCompanyId: true,
      assignmentScope: true,
      province: true,
      privateCompanyTargetDepartmentId: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }

  const gate = await canStaffSubmitExpenseOnTicket(guard.requesterId, ticket, guard.companyId);
  if (!gate.ok) {
    return NextResponse.json({ success: false, message: gate.message }, { status: gate.status });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: guard.requesterId },
    select: { privateCompanyDepartmentId: true },
  });
  const departmentId =
    me?.privateCompanyDepartmentId ?? ticket.privateCompanyTargetDepartmentId ?? null;
  const ticketProvince =
    typeof ticket.province === 'string' && ticket.province.trim() ? ticket.province.trim() : null;

  const created = await prisma.privateCompanyTicketExpense.create({
    data: {
      companyId: guard.companyId,
      ticketId,
      staffRequesterId: guard.requesterId,
      amount,
      currency,
      reason,
      note,
      ticketProvince,
      departmentId,
    },
    include: {
      staff: { select: { id: true, name: true, username: true } },
      ticket: {
        select: {
          id: true,
          siteName: true,
          technique: true,
          status: true,
          province: true,
        },
      },
    },
  });

  return NextResponse.json({ success: true, expense: expenseRowToJson(created) });
}
