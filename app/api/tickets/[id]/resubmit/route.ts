import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

const prisma = _prisma as any;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const coordinatorContext = await getCoordinatorContext(req);
    const { id } = await params;
    const body = await req.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const target = typeof body.target === 'string' ? body.target.trim().toUpperCase() : 'COORDINATOR';
    if (!reason) {
      return NextResponse.json({ success: false, message: 'Resubmit reason is required.' }, { status: 400 });
    }

    if (coordinatorContext) {
      const allowed = new Set(['QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'ENGINEER']);
      if (!allowed.has(coordinatorContext.role)) {
        return NextResponse.json({ success: false, message: 'Only engineering staff can resubmit tickets.' }, { status: 403 });
      }

      const ticket = await prisma.visitorRequest.findFirst({
        where: { id, coordinatorCompanyId: coordinatorContext.companyId },
        select: { id: true, company: true, assigneeCoordinatorUserId: true, createdByCoordinatorUserId: true },
      });
      if (!ticket) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      if (ticket.assigneeCoordinatorUserId && ticket.assigneeCoordinatorUserId !== coordinatorContext.userId) {
        return NextResponse.json({ success: false, message: 'Only assigned engineer/technician can resubmit.' }, { status: 403 });
      }

      const parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
      const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
      history.push({
        at: new Date().toISOString(),
        byUserId: coordinatorContext.userId,
        byRole: coordinatorContext.role,
        target,
        reason,
      });
      parsed.resubmitHistory = history;
      parsed.workflowState = 'RESUBMITTED';
      parsed.resubmitReason = reason;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          workflowState: 'RESUBMITTED',
          resubmittedAt: new Date(),
          resubmittedByCoordinatorUserId: coordinatorContext.userId,
          resubmitReason: reason,
          company: JSON.stringify(parsed),
        },
      });

      return NextResponse.json({ success: true, message: 'Ticket resubmitted for edits.' });
    }

    // Legacy requester flow (backward compatibility)
    const requester = auth.payload;
    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, company: true },
    });
    if (!row || row.requesterId !== requester.requesterId) {
      return NextResponse.json({ success: false, message: 'Not allowed to update this ticket' }, { status: 403 });
    }
    const parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
    const history = Array.isArray(parsed.resubmitHistory) ? parsed.resubmitHistory : [];
    history.push({
      at: new Date().toISOString(),
      byUserId: requester.requesterId,
      byRole: requester.role ?? 'COMPANY',
      target,
      reason,
    });
    parsed.resubmitHistory = history;
    parsed.workflowState = 'RESUBMITTED';
    parsed.resubmitReason = reason;
    await prisma.visitorRequest.update({
      where: { id },
      data: { company: JSON.stringify(parsed) },
    });
    return NextResponse.json({ success: true, message: 'Ticket resubmitted for edits.' });
  } catch (err) {
    console.error('POST /api/tickets/[id]/resubmit:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to resubmit ticket' },
      { status: 500 }
    );
  }
}
