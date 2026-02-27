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
      select: { id: true, status: true, company: true },
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
    const inspectionResult = typeof body.inspectionResult === 'string' ? body.inspectionResult.trim() : null;
    const inspectionComments = typeof body.inspectionComments === 'string' ? body.inspectionComments.trim() : null;

    parsed.status = 'COMPLETED';
    parsed.completedAt = new Date().toISOString();
    if (checklistResponse) {
      parsed.checklistResponse = checklistResponse;
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
        status: 'COMPLETED',
        completedAt: new Date(),
        company: JSON.stringify(parsed),
        checklistResponse: checklistResponse ? JSON.stringify(checklistResponse) : undefined,
      },
    });

    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: 'COMPLETED' },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, message: 'Ticket completed' });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/complete:', error);
    return NextResponse.json({ success: false, message: 'Failed to complete ticket' }, { status: 500 });
  }
}
