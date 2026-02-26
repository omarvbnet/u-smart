import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

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
    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, name: true, username: true },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
    }

    const row = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: { id: true, status: true, company: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let currentStatus = row.status ?? 'PENDING';
    let parsed: Record<string, unknown> = {};
    if (typeof row.company === 'string') {
      try {
        parsed = JSON.parse(row.company) as Record<string, unknown>;
        if (parsed._ticket && typeof parsed.status === 'string') {
          currentStatus = parsed.status;
        }
      } catch { /* fallback */ }
    }

    if (currentStatus === 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Cannot assign a ticket that is still PENDING' },
        { status: 400 }
      );
    }

    if (parsed._ticket && parsed.assignedEngineerId) {
      return NextResponse.json(
        { success: false, message: 'Ticket is already assigned to an engineer' },
        { status: 400 }
      );
    }

    if (parsed._ticket) {
      parsed.assignedEngineerId = requester.id;
      parsed.assignedEngineerName = requester.name || requester.username;
      parsed.assignedAt = new Date().toISOString();

      await prisma.visitorRequest.update({
        where: { id },
        data: { company: JSON.stringify(parsed) },
      });
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id,
        assignedEngineerId: requester.id,
        assignedEngineerName: requester.name || requester.username,
      },
    });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/assign:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to assign ticket' },
      { status: 500 }
    );
  }
}
