import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
import {
  CAN_SUBMIT_TICKET_EXPENSE_ROLES,
  expenseRowToJson,
  expensesGuard,
} from '@/lib/private-company-expenses';
import { normalizeProvince } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

function parseInclusiveRange(
  fromParam: string | null,
  toParam: string | null
): { from: Date; to: Date } | { error: string } | null {
  const f = fromParam?.trim();
  const t = toParam?.trim();
  if (!f || !t) return null;
  const fromNorm = f.includes('T') ? f : `${f}T00:00:00.000Z`;
  const toNorm = t.includes('T') ? t : `${t}T23:59:59.999Z`;
  const from = new Date(fromNorm);
  const to = new Date(toNorm);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return { error: 'Invalid from or to date.' };
  }
  if (from > to) {
    return { error: 'from must be before or equal to to.' };
  }
  const spanDays = (to.getTime() - from.getTime()) / 86400000;
  if (spanDays > 370) {
    return { error: 'Date range cannot exceed 370 days.' };
  }
  return { from, to };
}

/**
 * GET /api/provisor-private-company/expenses/export?from=yyyy-MM-dd&to=yyyy-MM-dd&province=&departmentId=
 * XLSX line items: owners (optional dept), managers/coordinators (their dept), field staff (own lines only).
 */
export async function GET(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const parsed = parseInclusiveRange(url.searchParams.get('from'), url.searchParams.get('to'));
  if (parsed && 'error' in parsed) {
    return NextResponse.json({ success: false, message: parsed.error }, { status: 400 });
  }
  if (!parsed) {
    return NextResponse.json(
      { success: false, message: 'Query params from and to are required (YYYY-MM-DD).' },
      { status: 400 }
    );
  }
  const { from, to } = parsed;

  const provinceFilter = normalizeProvince(url.searchParams.get('province'));
  let departmentId = url.searchParams.get('departmentId')?.trim() || null;

  const where: Record<string, unknown> = {
    companyId: guard.companyId,
    createdAt: { gte: from, lte: to },
  };
  if (provinceFilter) where.ticketProvince = provinceFilter;

  if (guard.isOwner) {
    if (departmentId) where.departmentId = departmentId;
  } else if (MANAGER_ROLES.has(guard.actorRole)) {
    if (!guard.actorDepartmentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your account must be assigned to a department to export expenses.',
        },
        { status: 403 }
      );
    }
    if (departmentId && departmentId !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only export expenses for your department.' },
        { status: 403 }
      );
    }
    departmentId = guard.actorDepartmentId;
    where.departmentId = departmentId;
  } else if (CAN_SUBMIT_TICKET_EXPENSE_ROLES.has(guard.actorRole)) {
    where.staffRequesterId = guard.requesterId;
  } else {
    return NextResponse.json(
      { success: false, message: 'You are not allowed to export expenses.' },
      { status: 403 }
    );
  }

  const rows = await prisma.privateCompanyTicketExpense.findMany({
    where,
    orderBy: [{ staffRequesterId: 'asc' }, { createdAt: 'asc' }],
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

  const header = [
    'DateTime (UTC)',
    'Staff ID',
    'Staff name',
    'Amount',
    'Currency',
    'Reason',
    'Note',
    'Ticket ID',
    'Site',
    'Technique',
    'Ticket status',
    'Province',
    'Department ID',
  ];
  const data: (string | number)[][] = [header];
  for (const r of rows) {
    const j = expenseRowToJson(r);
    const created =
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? '');
    data.push([
      created,
      j.staffId,
      j.staffName ?? '',
      j.amount,
      j.currency,
      j.reason,
      j.note ?? '',
      j.ticketId,
      j.ticket?.siteName ?? '',
      j.ticket?.technique ?? '',
      j.ticket?.status ?? '',
      j.ticketProvince ?? '',
      j.departmentId ?? '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  // Copy into a standalone Uint8Array — avoids `Blob` empty-body issues on some CDNs
  // and satisfies NextResponse `BodyInit` typing (Buffer types vary by TS lib).
  const u8 = Uint8Array.from(buf);
  const slug = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
  return new NextResponse(u8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ticket-expenses-${slug}.xlsx"`,
      'Content-Length': String(u8.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
