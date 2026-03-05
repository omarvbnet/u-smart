import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'];
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const VALID_RESOLUTIONS = ['accepted', 'not_accepted', 'ncr', 'accepted_with_comments', 're_inspection', 'keep_same', 're_maintain', 'no_need'];

function rowToConflict(row: any): any {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    return null;
  }
  const technique = (row.technique ?? '').toLowerCase();
  const isMaintenance = MAINTENANCE_TECHNIQUES.includes(technique);
  const inspectionResult = isMaintenance ? 'maintenance' : ((parsed.inspectionResult as string) ?? 'not_accepted');
  const out: Record<string, unknown> = {
    id: row.id,
    ticketId: row.id,
    siteName: parsed.siteName ?? null,
    siteCoordinator: parsed.siteCoordinator ?? null,
    assignedEngineerId: parsed.assignedEngineerId ?? null,
    assignedEngineerName: parsed.assignedEngineerName ?? null,
    inspectionResult,
    inspectionComments: parsed.inspectionComments ?? null,
    ncrReason: parsed.ncrReason ?? null,
    inspectionChecklist: Array.isArray(parsed.inspectionChecklist)
      ? parsed.inspectionChecklist
      : null,
    status: (parsed.conflictStatus as string) ?? 'pending',
    resolvedBy: parsed.conflictResolvedBy ?? null,
    resolvedAt: parsed.conflictResolvedAt ?? null,
    resolution: parsed.conflictResolution ?? null,
    resolutionComment: parsed.conflictResolutionComment ?? null,
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
    conflictReportComment: parsed.conflictReportComment ?? null,
    isMaintenanceConflict: isMaintenance,
  };
  if (isMaintenance && Array.isArray(parsed.conflictImageUrls)) {
    out.conflictImageUrls = parsed.conflictImageUrls.filter((u: unknown) => typeof u === 'string');
  }
  return out;
}

export async function GET(
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Conflict ID required' }, { status: 400 });
  }

  try {
    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, company: true, status: true, requesterId: true, technique: true },
    });

    if (!row) {
      return NextResponse.json({ success: false, message: 'Conflict not found' }, { status: 404 });
    }

    let parsedCheck: Record<string, unknown> = {};
    try {
      parsedCheck = typeof row.company === 'string' ? JSON.parse(row.company) : {};
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 500 });
    }
    const assignedEngineerId = parsedCheck.assignedEngineerId as string | undefined;
    const isOwner = row.requesterId === auth.payload.requesterId;
    const isAssigned = assignedEngineerId === auth.payload.requesterId;
    if (!isOwner && !isAssigned) {
      return NextResponse.json({ success: false, message: 'Conflict not found' }, { status: 404 });
    }

    if (parsedCheck.conflictReported !== true && row.status === 'COMPLETED') {
      const ir = ((parsedCheck.inspectionResult as string) ?? '').toLowerCase();
      if (CONFLICT_RESULTS.includes(ir)) {
        parsedCheck.conflictReported = true;
        parsedCheck.conflictStatus = 'pending';
      }
    }

    const conflict = rowToConflict({ ...row, technique: row.technique, company: JSON.stringify(parsedCheck) });
    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('GET /api/conflicts/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch conflict' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  if (requesterRole !== 'ENGINEER' && requesterRole !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Only engineers or admins can resolve conflicts' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Conflict ID required' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : null;
  const comment = typeof body.comment === 'string' ? body.comment.trim() : null;

  if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { success: false, message: `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const whereClause: any = { id };
    if (requesterRole !== 'ADMIN') {
      whereClause.company = { contains: auth.payload.requesterId };
    }
    const ticket = await prisma.visitorRequest.findFirst({
      where: whereClause,
      select: { id: true, company: true, requesterId: true, technique: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Conflict not found or not assigned to you' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 500 });
    }

    const isMaintenanceResolution = resolution === 're_maintain' || resolution === 'no_need';
    parsed.conflictStatus = (resolution === 're_inspection' || resolution === 'keep_same') ? 're_inspection' : 'resolved';
    parsed.conflictResolvedBy = auth.payload.requesterId;
    parsed.conflictResolvedAt = new Date().toISOString();
    parsed.conflictResolution = resolution;
    if (comment) parsed.conflictResolutionComment = comment;

    let newTicketStatus: string | null = null;
    if (resolution === 're_maintain') {
      parsed.status = 'PENDING';
      newTicketStatus = 'PENDING';
    } else if (resolution === 're_inspection') {
      // Preserve previous inspection (checklist, comments, result) in history before clearing
      const checklistHistory = Array.isArray(parsed.checklistHistory) ? parsed.checklistHistory : [];
      if (parsed.inspectionChecklist || parsed.inspectionResult || parsed.inspectionComments) {
        checklistHistory.push({
          at: new Date().toISOString(),
          inspectionChecklist: parsed.inspectionChecklist ?? [],
          inspectionResult: parsed.inspectionResult ?? null,
          inspectionComments: parsed.inspectionComments ?? null,
        });
      }
      parsed.checklistHistory = checklistHistory;
      parsed.inspectionResult = null;
      parsed.inspectionComments = null;
      parsed.inspectionChecklist = null;
      parsed.checklistResponse = null;
      parsed.status = 'IN_PROGRESS';
      newTicketStatus = 'IN_PROGRESS';
    } else if (resolution !== 'keep_same' && !isMaintenanceResolution) {
      parsed.inspectionResult = resolution;
    }

    const updateData: { company: string; status?: string; completedAt?: null } = { company: JSON.stringify(parsed) };
    if (newTicketStatus) {
      updateData.status = newTicketStatus;
      updateData.completedAt = null;
    }

    await prisma.visitorRequest.update({
      where: { id },
      data: updateData,
    });

    if (newTicketStatus === 'IN_PROGRESS' || newTicketStatus === 'PENDING') {
      try {
        await prisma.ticketStatusLog.create({
          data: {
            visitorRequestId: id,
            status: newTicketStatus,
          },
        });
      } catch (logErr) {
        /* ticketStatusLog may not exist */
      }
    }

    const conflict = rowToConflict({ ...ticket, technique: ticket.technique, company: JSON.stringify(parsed) });
    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('PATCH /api/conflicts/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to resolve conflict' },
      { status: 500 }
    );
  }
}
