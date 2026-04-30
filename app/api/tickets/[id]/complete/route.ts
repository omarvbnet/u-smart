import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { sendPushToRequesters } from '@/lib/push-notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

  try {
    const ticket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, status: true, company: true, requesterId: true, technique: true, beforeImageUrls: true, finishingImageUrls: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch { /* ignore */ }

    const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
    if (assignedId !== auth.payload.requesterId) {
      return NextResponse.json({ success: false, message: 'Only the assigned technician or engineer can complete this ticket' }, { status: 403 });
    }

    if (ticket.status === 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Ticket is already completed' }, { status: 400 });
    }

    const tech = (ticket.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(tech);

    const body = await req.json();
    const checklistResponse = body.checklistResponse ?? null;

    // Maintenance: no checklist; require 4–6 before and 4–6 after images
    if (isMaintenance) {
      if (checklistResponse) {
        return NextResponse.json({ success: false, message: 'Maintenance tickets do not use checklists. Attach 4–6 before and 4–6 after photos and complete.' }, { status: 400 });
      }
      const beforeUrls = Array.isArray(body.beforeImageUrls) ? body.beforeImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim()) : [];
      const afterUrls = Array.isArray(body.finishingImageUrls) ? body.finishingImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim()) : [];
      if (beforeUrls.length < 4 || beforeUrls.length > 6) {
        return NextResponse.json({ success: false, message: 'Before images must be between 4 and 6' }, { status: 400 });
      }
      if (afterUrls.length < 4 || afterUrls.length > 6) {
        return NextResponse.json({ success: false, message: 'After images must be between 4 and 6' }, { status: 400 });
      }
      parsed.beforeImageUrls = beforeUrls;
      parsed.finishingImageUrls = afterUrls;
    }
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

    const updateData: Record<string, unknown> = {
      status: isNcr ? 'IN_PROGRESS' : 'COMPLETED',
      completedAt: isNcr ? null : new Date(),
      company: JSON.stringify(parsed),
      checklistResponse: checklistResponse ? JSON.stringify(checklistResponse) : undefined,
    };
    if (isMaintenance && !isNcr) {
      updateData.beforeImageUrls = parsed.beforeImageUrls ?? [];
      updateData.finishingImageUrls = parsed.finishingImageUrls ?? [];
    }
    await prisma.visitorRequest.update({
      where: { id },
      data: updateData,
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
        const message = isNcr
          ? 'An NCR has been raised on your ticket. Please resubmit with corrective action.'
          : `Your ticket has been completed${resultText ? ` — Result: ${resultText}` : ''}`;
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: isNcr ? 'NCR raised' : 'Ticket completed',
            message,
            ticketId: id,
            requesterId: ticket.requesterId,
            forAdmin: false,
          },
        });
        await sendPushToRequesters(prisma, [ticket.requesterId], {
          title: isNcr ? 'NCR raised' : 'Ticket completed',
          body: message,
          data: { ticketId: id, type: 'status_changed' },
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ success: true, message: 'Ticket completed' });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/complete:', error);
    return NextResponse.json({ success: false, message: 'Failed to complete ticket' }, { status: 500 });
  }
}
