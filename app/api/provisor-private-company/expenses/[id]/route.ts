import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { assignedStaffIdFromCompanyJson, parseTicketCompanyJson } from '@/lib/private-company-kpi';
import { expensesGuard } from '@/lib/private-company-expenses';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * DELETE /api/provisor-private-company/expenses/[id]
 * Only the assigned ticket lead (company JSON assignedEngineerId) may delete lines
 * while the ticket is open. Managers/crew cannot delete others’ lines via API.
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
      ticket: { select: { id: true, status: true, company: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Expense not found.' }, { status: 404 });
  }

  if (String(row.ticket?.status ?? '').toUpperCase() === 'COMPLETED') {
    return NextResponse.json(
      { success: false, message: 'Cannot delete expenses on a completed ticket.' },
      { status: 400 }
    );
  }

  const parsed = parseTicketCompanyJson(row.ticket?.company ?? null);
  const leadId = assignedStaffIdFromCompanyJson(parsed);
  if (!leadId || leadId !== guard.requesterId) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the assigned ticket lead can delete expense lines.',
      },
      { status: 403 }
    );
  }

  await prisma.privateCompanyTicketExpense.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
