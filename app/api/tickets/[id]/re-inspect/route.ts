import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';

const prisma = _prisma as any;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    let requesterRole = 'COMPANY';
    try {
      const reqRow = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true },
      });
      requesterRole = reqRow?.role ?? 'COMPANY';
    } catch { /* fallback */ }

    if (requesterRole !== 'COMPANY') {
      return NextResponse.json(
        { success: false, message: 'Only company users can trigger re-inspection' },
        { status: 403 }
      );
    }

    const row = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: { id: true, status: true, company: true, requesterId: true },
    });

    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (row.status !== 'COMPLETED') {
      return NextResponse.json(
        { success: false, message: 'Can only re-inspect completed tickets' },
        { status: 400 }
      );
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
    } catch { /* ignore */ }

    if (!parsed._ticket) {
      return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 400 });
    }

    // Set status back to IN_PROGRESS so engineer can re-do inspection
    parsed.status = 'IN_PROGRESS';
    parsed.completedAt = null;
    parsed.inspectionResult = null;
    parsed.inspectionComments = null;
    parsed.inspectionChecklist = null;
    parsed.checklistResponse = null;
    parsed.ncrReason = null;
    parsed.ncrImageUrls = [];
    parsed.ncrResubmissions = [];

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        completedAt: null,
        company: JSON.stringify(parsed),
        checklistResponse: null,
      },
    });

    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: 'IN_PROGRESS' },
      });
    } catch { /* ignore */ }

    // Notify assigned engineer about re-inspection
    const assignedEngineerId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
    if (assignedEngineerId) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'status_changed',
          ticketId: id,
          requesterId: assignedEngineerId,
          payload: { key: 'reinspect_requested' },
          data: { ticketId: id, type: 'status_changed' },
        });
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      success: true,
      ticket: { id, status: 'IN_PROGRESS' },
    });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/re-inspect:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to trigger re-inspection' },
      { status: 500 }
    );
  }
}
