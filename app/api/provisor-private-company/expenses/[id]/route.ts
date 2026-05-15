import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { expensesGuard } from '@/lib/private-company-expenses';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

/**
 * DELETE /api/provisor-private-company/expenses/[id]
 * Submitter may delete own line before ticket is completed; managers/owner anytime.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'id required.' }, { status: 400 });
  }

  const row = await prisma.privateCompanyTicketExpense.findFirst({
    where: { id, companyId: guard.companyId },
    include: {
      ticket: { select: { id: true, status: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Expense not found.' }, { status: 404 });
  }

  const isManager = guard.isOwner || MANAGER_ROLES.has(guard.actorRole);
  const isOwnerLine = row.staffRequesterId === guard.requesterId;
  if (!isManager && !isOwnerLine) {
    return NextResponse.json(
      { success: false, message: 'You can only delete your own expense entries.' },
      { status: 403 }
    );
  }
  if (!isManager && String(row.ticket?.status ?? '').toUpperCase() === 'COMPLETED') {
    return NextResponse.json(
      { success: false, message: 'Cannot delete expenses on a completed ticket.' },
      { status: 400 }
    );
  }
  if (
    !guard.isOwner &&
    guard.actorRole === 'MANAGER' &&
    guard.actorDepartmentId &&
    row.departmentId !== guard.actorDepartmentId
  ) {
    return NextResponse.json(
      { success: false, message: 'Expense is outside your department.' },
      { status: 403 }
    );
  }

  await prisma.privateCompanyTicketExpense.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
