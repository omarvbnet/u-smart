import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

/**
 * Engineer responds to requester's NCR resubmission.
 * - approved: re-open checklist (keep previous as history), allow new inspection
 * - rework: send NCR back to requester with feedback to fix
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  let requesterRole = 'COMPANY';
  try {
    const reqRow = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true },
    });
    requesterRole = reqRow?.role ?? 'COMPANY';
  } catch { /* fallback */ }

  if (requesterRole !== 'ENGINEER') {
    return NextResponse.json(
      { success: false, message: 'Only engineers can respond to NCR resubmissions' },
      { status: 403 }
    );
  }

  const { id } = await params;
  const row = await prisma.visitorRequest.findUnique({
    where: { id },
    select: { id: true, status: true, company: true, requesterId: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 400 });
  }

  const assignedEngineerId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
  if (assignedEngineerId !== auth.payload.requesterId) {
    return NextResponse.json({ success: false, message: 'Only the assigned engineer can respond' }, { status: 403 });
  }

  const list = Array.isArray(parsed.ncrResubmissions) ? (parsed.ncrResubmissions as Array<Record<string, unknown>>) : [];
  const lastEntry = list[list.length - 1];
  const lastByRequester = lastEntry && lastEntry.by === 'requester' && lastEntry.action === 'resubmit';
  if (!lastByRequester) {
    return NextResponse.json(
      { success: false, message: 'No requester resubmission pending' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';

  if (action !== 'approved' && action !== 'rework') {
    return NextResponse.json(
      { success: false, message: 'Action must be approved or rework' },
      { status: 400 }
    );
  }

  list.push({
    at: new Date().toISOString(),
    by: 'engineer',
    action,
    comment: comment || null,
    imageUrls: [],
  });
  parsed.ncrResubmissions = list;

  if (action === 'approved') {
    // Re-open checklist: keep previous as history, clear for re-inspection
    const checklistHistory = Array.isArray(parsed.checklistHistory) ? parsed.checklistHistory : [];
    if (parsed.checklistResponse || parsed.inspectionChecklist) {
      checklistHistory.push({
        at: new Date().toISOString(),
        checklistResponse: parsed.checklistResponse,
        inspectionChecklist: parsed.inspectionChecklist,
        inspectionResult: parsed.inspectionResult,
      });
    }
    parsed.checklistHistory = checklistHistory;
    parsed.checklistResponse = null;
    parsed.inspectionChecklist = null;
    parsed.inspectionResult = null;
    parsed.inspectionComments = null;
    parsed.ncrReason = null;
    parsed.ncrImageUrls = [];
    parsed.status = 'IN_PROGRESS';
    parsed.completedAt = null;

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

    if (row.requesterId && typeof prisma.notification?.create === 'function') {
      try {
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: 'NCR approved — re-inspection',
            message: 'Your NCR resubmission was approved. The engineer will re-inspect.',
            ticketId: id,
            requesterId: row.requesterId,
            forAdmin: false,
          },
        });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ success: true, message: 'Approved — re-inspection opened' });
  }

  // action === 'rework': send back to requester
  await prisma.visitorRequest.update({
    where: { id },
    data: { company: JSON.stringify(parsed) },
  });

  if (row.requesterId && typeof prisma.notification?.create === 'function') {
    try {
      await prisma.notification.create({
        data: {
          type: 'status_changed',
          title: 'NCR rework requested',
          message: comment
            ? `Engineer requested rework: ${comment}`
            : 'Engineer requested rework. Please fix and resubmit.',
          ticketId: id,
          requesterId: row.requesterId,
          forAdmin: false,
        },
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ success: true, message: 'Rework sent to requester' });
}
