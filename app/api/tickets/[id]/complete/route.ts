import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const ticket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, status: true, company: true, requesterId: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch { /* ignore */ }

    const assignedEngineerId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
    if (assignedEngineerId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Only the assigned engineer can complete this ticket' }, { status: 403 });
    }

    if (ticket.status === 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Ticket is already completed' }, { status: 400 });
    }

    const body = await req.json();
    const checklistResponse = body.checklistResponse ?? null;
    const inspectionResult = typeof body.inspectionResult === 'string' ? body.inspectionResult.trim().toLowerCase() : null;
    const inspectionComments = typeof body.inspectionComments === 'string' ? body.inspectionComments.trim() : null;
    const ncrReason = typeof body.ncrReason === 'string' ? body.ncrReason.trim() : (inspectionResult === 'ncr' ? inspectionComments : null);
    const ncrImageUrls = Array.isArray(body.ncrImageUrls) ? body.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];

    // NCR: keep status IN_PROGRESS until NCR is resolved (requester resubmits → engineer approves or reworks)
    const isNcr = inspectionResult === 'ncr';
    if (!isNcr) {
      parsed.status = 'COMPLETED';
      parsed.completedAt = new Date().toISOString();
    } else {
      parsed.inspectionResult = 'ncr';
      parsed.ncrReason = ncrReason || inspectionComments || null;
      parsed.ncrImageUrls = ncrImageUrls.length > 0 ? ncrImageUrls : [];
      parsed.ncrResubmissions = Array.isArray(parsed.ncrResubmissions) ? parsed.ncrResubmissions : [];
    }
    if (checklistResponse) {
      parsed.checklistResponse = checklistResponse;
      // Convert to inspectionChecklist format expected by admin panel
      const items = Array.isArray(checklistResponse.items) ? checklistResponse.items : [];
      parsed.inspectionChecklist = items.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? ''),
        label: String(item.label ?? ''),
        checked: !!item.checked,
        result: typeof item.result === 'string' ? item.result : (item.checked ? 'accepted' : 'rejected'),
        comment: typeof item.comment === 'string' ? item.comment : (typeof item.note === 'string' ? item.note : undefined),
        weight: typeof item.weight === 'string' ? item.weight : 'minor',
      }));
    }
    if (inspectionResult) {
      parsed.inspectionResult = inspectionResult;
    }
    if (inspectionComments) {
      parsed.inspectionComments = inspectionComments;
    }

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: isNcr ? 'IN_PROGRESS' : 'COMPLETED',
        completedAt: isNcr ? null : new Date(),
        company: JSON.stringify(parsed),
        checklistResponse: checklistResponse ? JSON.stringify(checklistResponse) : undefined,
      },
    });

    if (!isNcr) {
      try {
        await prisma.ticketStatusLog.create({
          data: { visitorRequestId: id, status: 'COMPLETED' },
        });
      } catch { /* ignore */ }
    }

    // Notify company: completed (non-NCR) or NCR raised
    if (ticket.requesterId && typeof prisma.notification?.create === 'function') {
      try {
        const resultLabel: Record<string, string> = {
          accepted: 'Accepted',
          accepted_with_comments: 'Accepted with Comments',
          not_accepted: 'Not Accepted',
          ncr: 'NCR',
        };
        const resultText = inspectionResult ? (resultLabel[inspectionResult] ?? inspectionResult) : '';
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: isNcr ? 'NCR raised' : 'Ticket completed',
            message: isNcr
              ? 'An NCR has been raised on your ticket. Please resubmit with corrective action.'
              : `Your ticket has been completed${resultText ? ` — Result: ${resultText}` : ''}`,
            ticketId: id,
            requesterId: ticket.requesterId,
            forAdmin: false,
          },
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ success: true, message: 'Ticket completed' });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/complete:', error);
    return NextResponse.json({ success: false, message: 'Failed to complete ticket' }, { status: 500 });
  }
}
