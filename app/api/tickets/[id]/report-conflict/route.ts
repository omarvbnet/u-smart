import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyWorkspaceConflictReported } from '@/lib/private-company-conflict-access';

const prisma = _prisma as any;

const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'];
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const CONFLICT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function toConflictPayload(row: any, parsed: Record<string, unknown>, technique: string) {
  const isMaint = MAINTENANCE_TECHNIQUES.includes((technique ?? '').toLowerCase());
  const inspectionResult = isMaint ? 'maintenance' : ((parsed.inspectionResult as string) ?? 'not_accepted');
  const payload: Record<string, unknown> = {
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
    conflictReportComment: (parsed.conflictReportComment as string) ?? null,
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
    isMaintenanceConflict: isMaint,
  };
  if (isMaint && Array.isArray(parsed.conflictImageUrls)) {
    payload.conflictImageUrls = parsed.conflictImageUrls.filter((u: unknown) => typeof u === 'string');
  }
  return payload;
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

  if (requesterRole !== 'COMPANY' && requesterRole !== 'PERSONAL') {
    return NextResponse.json({ success: false, message: 'Only company or personal can report conflicts' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    const ticket = await prisma.visitorRequest.findFirst({
      where: { id, requesterId: auth.payload.requesterId },
      select: {
        id: true,
        company: true,
        status: true,
        technique: true,
        completedAt: true,
        privateCompanyId: true,
        privateCompanyTargetDepartmentId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const technique = (ticket.technique ?? '').toLowerCase();
    const isMaintenance = MAINTENANCE_TECHNIQUES.includes(technique);

    if (isMaintenance) {
      if (ticket.status !== 'COMPLETED') {
        return NextResponse.json({ success: false, message: 'Only completed maintenance tickets can be reported as conflicts' }, { status: 400 });
      }
      const completedAt = ticket.completedAt ? new Date(ticket.completedAt).getTime() : null;
      if (!completedAt || Date.now() - completedAt > CONFLICT_WINDOW_MS) {
        return NextResponse.json(
          { success: false, message: 'Conflict can only be reported within 24 hours of completion' },
          { status: 400 }
        );
      }
    } else {
      if (ticket.status !== 'COMPLETED' && ticket.status !== 'IN_PROGRESS') {
        return NextResponse.json({ success: false, message: 'Only completed or in-progress tickets can be reported as conflicts' }, { status: 400 });
      }
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      /* ignore */
    }

    if (!isMaintenance) {
      const inspectionResult = ((parsed.inspectionResult as string) ?? '').toLowerCase();
      if (!CONFLICT_RESULTS.includes(inspectionResult)) {
        return NextResponse.json(
          { success: false, message: 'Ticket result must be not_accepted, ncr, or accepted_with_comments to report conflict' },
          { status: 400 }
        );
      }
    }

    if (parsed.conflictReported === true) {
      return NextResponse.json({ success: false, message: 'Conflict already reported. Each ticket can have only one conflict request.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment.trim() : null;
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((u: unknown) => typeof u === 'string')
      : [];

    if (isMaintenance) {
      if (!comment || comment.length === 0) {
        return NextResponse.json({ success: false, message: 'Conflict reason is required' }, { status: 400 });
      }
      if (imageUrls.length === 0) {
        return NextResponse.json({ success: false, message: 'At least one image is required' }, { status: 400 });
      }
    }

    parsed.conflictReported = true;
    parsed.conflictReportedBy = auth.payload.requesterId;
    parsed.conflictReportedAt = new Date().toISOString();
    parsed.conflictStatus = 'pending';
    if (comment) parsed.conflictReportComment = comment;
    if (isMaintenance && imageUrls.length > 0) parsed.conflictImageUrls = imageUrls;

    await prisma.visitorRequest.update({
      where: { id },
      data: { company: JSON.stringify(parsed) },
    });

    const conflict = toConflictPayload(ticket, parsed, technique);

    const pcId = (ticket as { privateCompanyId?: string | null }).privateCompanyId ?? null;
    if (pcId) {
      let siteName = '';
      try {
        const p = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
        siteName = String((p as { siteName?: string }).siteName ?? '').trim();
      } catch {
        /* ignore */
      }
      notifyWorkspaceConflictReported({
        ticketId: id,
        privateCompanyId: pcId,
        targetDepartmentId:
          (ticket as { privateCompanyTargetDepartmentId?: string | null })
            .privateCompanyTargetDepartmentId ?? null,
        siteName,
        isMaintenance,
      }).catch((e) => console.error('notifyWorkspaceConflictReported:', e));
    }

    return NextResponse.json({ success: true, conflict });
  } catch (err) {
    console.error('POST /api/tickets/[id]/report-conflict:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to report conflict' },
      { status: 500 }
    );
  }
}
