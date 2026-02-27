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
      select: { id: true, name: true, username: true, role: true },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
    }

    const role = requester.role ?? 'COMPANY';
    if (role !== 'ENGINEER') {
      return NextResponse.json({ success: false, message: 'Only engineers can assign tickets to themselves' }, { status: 403 });
    }

    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, status: true, company: true, requesterId: true },
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

    if (currentStatus !== 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Only PENDING tickets can be assigned' },
        { status: 400 }
      );
    }

    if (parsed._ticket && parsed.assignedEngineerId) {
      return NextResponse.json(
        { success: false, message: 'Ticket is already assigned to an engineer' },
        { status: 400 }
      );
    }

    // Check if engineer already has an uncompleted ticket
    const activeTickets = await prisma.visitorRequest.findMany({
      where: {
        status: { not: 'COMPLETED' },
        company: { contains: requester.id },
      },
      select: { id: true },
    });
    if (activeTickets.length > 0) {
      return NextResponse.json(
        { success: false, message: 'You already have an active ticket. Complete it before taking a new one.' },
        { status: 400 }
      );
    }

    const newStatus = 'ON_SITE';

    if (parsed._ticket) {
      parsed.assignedEngineerId = requester.id;
      parsed.assignedEngineerName = requester.name || requester.username;
      parsed.assignedAt = new Date().toISOString();
      parsed.status = newStatus;

      await prisma.visitorRequest.update({
        where: { id },
        data: {
          status: newStatus,
          company: JSON.stringify(parsed),
        },
      });
    } else {
      await prisma.visitorRequest.update({
        where: { id },
        data: { status: newStatus },
      });
    }

    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: newStatus },
      });
    } catch { /* ignore */ }

    // Notify the company that an engineer has been assigned
    if (row.requesterId && typeof prisma.notification?.create === 'function') {
      try {
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: 'Engineer assigned',
            message: `Engineer ${requester.name || requester.username} has been assigned to your ticket`,
            ticketId: id,
            requesterId: row.requesterId,
            forAdmin: false,
          },
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id,
        status: newStatus,
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
