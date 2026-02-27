import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

const ALLOWED_RESULTS = ['accepted', 'accepted_with_comments', 'not_accepted', 'ncr'];

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
        { success: false, message: 'Only company users can update inspection result' },
        { status: 403 }
      );
    }

    const row = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: { id: true, status: true, company: true },
    });

    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (row.status !== 'COMPLETED') {
      return NextResponse.json(
        { success: false, message: 'Can only update inspection on completed tickets' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const inspectionResult = typeof body.inspectionResult === 'string'
      ? body.inspectionResult.trim().toLowerCase()
      : null;
    const inspectionComments = typeof body.inspectionComments === 'string'
      ? body.inspectionComments.trim()
      : undefined;

    if (!inspectionResult || !ALLOWED_RESULTS.includes(inspectionResult)) {
      return NextResponse.json(
        { success: false, message: 'Valid inspectionResult required: accepted, accepted_with_comments, not_accepted, ncr' },
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

    parsed.inspectionResult = inspectionResult;
    if (inspectionComments !== undefined) {
      parsed.inspectionComments = inspectionComments || null;
    }
    if (inspectionResult === 'ncr' && !parsed.ncrReason) {
      parsed.ncrReason = null;
    }

    await prisma.visitorRequest.update({
      where: { id },
      data: { company: JSON.stringify(parsed) },
    });

    return NextResponse.json({
      success: true,
      ticket: { id, inspectionResult },
    });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/inspection:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update inspection' },
      { status: 500 }
    );
  }
}
