import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { assertReasonInList, loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';

const prisma = _prisma as any;

/**
 * POST /api/tickets/[id]/request-edit
 * Coordinator / owner marks a ticket NEEDS_EDIT so the assigned
 * engineer/technician knows they must revise their work.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getCoordinatorContext(req);
    if (!ctx) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated as coordinator' },
        { status: 401 },
      );
    }

    const managementRoles = new Set([
      'COMPANY_OWNER',
      'COORDINATOR',
      'ADMIN',
    ]);
    if (!managementRoles.has(ctx.role)) {
      return NextResponse.json(
        { success: false, message: 'Only coordinators or owners can request edits.' },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { success: false, message: 'Edit reason is required.' },
        { status: 400 },
      );
    }

    const policy = await loadPlatformTicketPolicy();
    const reasonCheck = assertReasonInList(reason, policy.resubmitReasons, 'Resubmit reasons');
    if (!reasonCheck.ok) {
      return NextResponse.json({ success: false, message: reasonCheck.message }, { status: 400 });
    }

    const { id } = await params;
    const ticket = await prisma.visitorRequest.findFirst({
      where: { id, coordinatorCompanyId: ctx.companyId },
      select: { id: true, company: true, status: true, workflowState: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 },
      );
    }

    if (
      String(ticket.status ?? '').toUpperCase() === 'COMPLETED' ||
      String(ticket.workflowState ?? '').toUpperCase() === 'DONE'
    ) {
      return NextResponse.json(
        { success: false, message: 'Cannot request edits on a completed ticket.' },
        { status: 400 },
      );
    }

    const parsed =
      typeof ticket.company === 'string'
        ? JSON.parse(ticket.company)
        : {};
    const history = Array.isArray(parsed.editRequestHistory)
      ? parsed.editRequestHistory
      : [];
    history.push({
      at: new Date().toISOString(),
      byUserId: ctx.userId,
      byRole: ctx.role,
      reason,
    });
    parsed.editRequestHistory = history;
    parsed.workflowState = 'NEEDS_EDIT';
    parsed.editRequestReason = reason;

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        workflowState: 'NEEDS_EDIT',
        company: JSON.stringify(parsed),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket marked as needs edit.',
    });
  } catch (err) {
    console.error('POST /api/tickets/[id]/request-edit:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to request edit' },
      { status: 500 },
    );
  }
}
