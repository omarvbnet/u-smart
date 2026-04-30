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
    const isEngineer = role === 'ENGINEER';
    const isTechnician = role === 'TECHNICIAN';
    if (!isEngineer && !isTechnician) {
      return NextResponse.json({ success: false, message: 'Only engineers or technicians can assign tickets' }, { status: 403 });
    }

    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, status: true, company: true, requesterId: true, technique: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
    const tech = (row.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(tech);
    if (isTechnician && !isMaintenance) {
      return NextResponse.json({ success: false, message: 'Technicians can only assign maintenance tickets' }, { status: 403 });
    }
    if (isEngineer && isMaintenance) {
      return NextResponse.json({ success: false, message: 'Engineers handle QC only; maintenance tickets are for technicians' }, { status: 403 });
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
        { success: false, message: 'Ticket is already assigned' },
        { status: 400 }
      );
    }

    // Check if engineer already has an uncompleted assigned ticket.
    // We parse ticket JSON payload instead of raw string search to avoid false positives.
    const activeTickets = await prisma.visitorRequest.findMany({
      where: {
        status: { not: 'COMPLETED' },
      },
      select: { id: true, company: true },
    });
    const hasActiveAssignedTicket = activeTickets.some((t: { id: string; company: string | null }) => {
      if (t.id === id) return false;
      if (!t.company || typeof t.company !== 'string') return false;
      try {
        const payload = JSON.parse(t.company) as { _ticket?: boolean; assignedEngineerId?: string };
        return payload._ticket === true && payload.assignedEngineerId === requester.id;
      } catch {
        return false;
      }
    });
    if (hasActiveAssignedTicket) {
      return NextResponse.json(
        { success: false, message: 'You already have an active ticket. Complete it before taking a new one.' },
        { status: 400 }
      );
    }

    const newStatus = 'ON_SITE';

    parsed.assignedEngineerId = requester.id;
    parsed.assignedEngineerName = requester.name || requester.username;
    parsed.assignedAt = new Date().toISOString();
    parsed.status = newStatus;
    if (!parsed._ticket) parsed._ticket = true;

    await prisma.visitorRequest.update({
      where: { id },
      data: {
        status: newStatus,
        company: JSON.stringify(parsed),
      },
    });

    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: newStatus },
      });
    } catch { /* ignore */ }

    // Notify the company that a technician/engineer has been assigned
    if (row.requesterId && typeof prisma.notification?.create === 'function') {
      try {
        const assigneeLabel = isTechnician ? 'Technician' : 'Engineer';
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: `${assigneeLabel} assigned`,
            message: `${assigneeLabel} ${requester.name || requester.username} has been assigned to your ticket`,
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
