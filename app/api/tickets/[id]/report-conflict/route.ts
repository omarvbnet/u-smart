import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'];

function toConflictPayload(row: any, parsed: Record<string, unknown>) {
  const inspectionResult = (parsed.inspectionResult as string) ?? 'not_accepted';
  return {
    id: row.id,
    ticketId: row.id,
    siteName: parsed.siteName ?? null,
    siteCoordinator: parsed.siteCoordinator ?? null,
    assignedEngineerId: parsed.assignedEngineerId ?? null,
    assignedEngineerName: parsed.assignedEngineerName ?? null,
    inspectionResult,
    inspectionComments: (parsed.inspectionComments as string) ?? null,
    ncrReason: (parsed.ncrReason as string) ?? null,
    inspectionChecklist: Array.isArray(parsed.inspectionChecklist)
      ? parsed.inspectionChecklist
      : null,
    status: (parsed.conflictStatus as string) ?? 'pending',
    resolvedBy: parsed.conflictResolvedBy ?? null,
    resolvedAt: parsed.conflictResolvedAt ?? null,
    resolution: parsed.conflictResolution ?? null,
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
  };
}

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
  } catch {
    /* ignore */
  }

  if (requesterRole !== 'COMPANY') {
    return NextResponse.json({ success: false, message: 'Only company can report conflicts' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    const ticket = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: { id: true, company: true, status: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (ticket.status !== 'COMPLETED' && ticket.status !== 'IN_PROGRESS') {
      return NextResponse.json({ success: false, message: 'Only completed or in-progress tickets can be reported as conflicts' }, { status: 400 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      /* ignore */
    }

    const inspectionResult = ((parsed.inspectionResult as string) ?? '').toLowerCase();
    if (!CONFLICT_RESULTS.includes(inspectionResult)) {
      return NextResponse.json(
        { success: false, message: 'Ticket result must be not_accepted, ncr, or accepted_with_comments to report conflict' },
        { status: 400 }
      );
    }

    if (parsed.conflictReported === true) {
      return NextResponse.json({ success: false, message: 'Conflict already reported' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment.trim() : null;

    parsed.conflictReported = true;
    parsed.conflictReportedBy = auth.payload.requesterId;
    parsed.conflictReportedAt = new Date().toISOString();
    parsed.conflictStatus = 'pending';
    if (comment) parsed.conflictReportComment = comment;

    await prisma.visitorRequest.update({
      where: { id },
      data: { company: JSON.stringify(parsed) },
    });

    const conflict = toConflictPayload(ticket, parsed);
    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('POST /api/tickets/[id]/report-conflict:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to report conflict' },
      { status: 500 }
    );
  }
}
