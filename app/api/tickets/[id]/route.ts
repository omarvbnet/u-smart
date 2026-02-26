import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

const prisma = _prisma as any;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  // Determine requester role to decide access rules
  let requesterRole = 'COMPANY';
  try {
    const reqRow = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { role: true },
    });
    requesterRole = reqRow?.role ?? 'COMPANY';
  } catch { /* fallback to COMPANY */ }

  try {
    // For COMPANY users: must own the ticket.
    // For ENGINEER users: ticket must be PENDING or assigned to them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let whereClause: any;
    if (requesterRole === 'ENGINEER') {
      whereClause = { id };
    } else {
      whereClause = { id, requesterId: payload.requesterId };
    }

    let row: any;
    try {
      row = await prisma.visitorRequest.findFirst({
        where: whereClause,
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          completedAt: true,
          maintenanceDescription: true,
          beforeImageUrls: true,
          finishingImageUrls: true,
          assignedTeamId: true,
          assignedTeam: {
            select: {
              id: true,
              name: true,
              leader: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      });
    } catch (schemaErr) {
      row = await prisma.visitorRequest.findFirst({
        where: whereClause,
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      });
    }

    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let logs: { status: string; createdAt: Date }[] = [];
    try {
      logs = await prisma.ticketStatusLog.findMany({
        where: { visitorRequestId: id },
        orderBy: { createdAt: 'asc' },
        select: { status: true, createdAt: true },
      });
    } catch {
      /* ticketStatusLog may not exist in all schemas */
    }

    let siteName: string | null = null;
    let siteCoordinator: string | null = null;
    let slaHours: number | null = null;
    let companyName: string | null = null;
    let status = row.status ?? 'PENDING';
    let completedAt: string | null = row.completedAt ? String(row.completedAt) : null;
    let designSpecifications: string | null = null;
    let attachmentUrls: string[] = [];
    let inspectionResult: string | null = null;
    let inspectionComments: string | null = null;
    let inspectionChecklist: Array<{ id: string; label: string; checked: boolean; comment?: string }> = [];
    let ncrReason: string | null = null;
    let ncrImageUrls: string[] = [];
    let ncrResubmissions: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }> = [];
    try {
      const parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
      if (parsed._ticket) {
        siteName = parsed.siteName ?? null;
        siteCoordinator = parsed.siteCoordinator ?? null;
        slaHours = parsed.slaHours ?? null;
        if (parsed.status) status = String(parsed.status);
        if (parsed.completedAt) completedAt = String(parsed.completedAt);
        designSpecifications = (parsed.designSpecifications as string) ?? null;
        attachmentUrls = Array.isArray(parsed.attachmentUrls) ? parsed.attachmentUrls.filter((u: unknown) => typeof u === 'string') : [];
        inspectionResult = (parsed.inspectionResult as string) ?? null;
        inspectionComments = (parsed.inspectionComments as string) ?? null;
        inspectionChecklist = Array.isArray(parsed.inspectionChecklist)
          ? parsed.inspectionChecklist
            .filter((c: unknown) => c && typeof c === 'object' && 'id' in c && 'label' in c && 'checked' in c)
            .map((c: { id: string; label: string; checked: boolean; comment?: string; weight?: string }) => ({ id: c.id, label: c.label, checked: !!c.checked, comment: c.comment, weight: c.weight === 'major' ? 'major' : 'minor' }))
          : [];
        ncrReason = (parsed.ncrReason as string) ?? null;
        ncrImageUrls = Array.isArray(parsed.ncrImageUrls) ? parsed.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];
        ncrResubmissions = Array.isArray(parsed.ncrResubmissions)
          ? (parsed.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({
              at: e.at || '',
              by: e.by || '',
              action: e.action || 'resubmit',
              comment: e.comment ?? null,
              imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [],
            }))
          : [];
      }
    } catch {
      /* ignore */
    }

    const statusTimeline =
      logs.length > 0
        ? logs.map((e) => ({ status: e.status, createdAt: e.createdAt }))
        : [{ status: status as string, createdAt: row.createdAt }];

    const maintenanceDescription = (row as any).maintenanceDescription ?? null;
    const beforeImageUrls = Array.isArray((row as any).beforeImageUrls) ? (row as any).beforeImageUrls : [];
    const finishingImageUrls = Array.isArray((row as any).finishingImageUrls) ? (row as any).finishingImageUrls : [];
    const assignedTeam = (row as any).assignedTeam
      ? {
          id: (row as any).assignedTeam.id,
          name: (row as any).assignedTeam.name,
          leader: (row as any).assignedTeam.leader
            ? { id: (row as any).assignedTeam.leader.id, fullName: (row as any).assignedTeam.leader.fullName, phone: (row as any).assignedTeam.leader.phone }
            : null,
        }
      : null;

    return NextResponse.json({
      success: true,
      ticket: {
        id: row.id,
        siteName,
        siteCoordinator,
        slaHours,
        technique: row.technique,
        status,
        createdAt: row.createdAt,
        completedAt,
        statusTimeline: statusTimeline.map((e) => ({ status: e.status, createdAt: e.createdAt })),
        maintenanceDescription,
        beforeImageUrls,
        finishingImageUrls,
        assignedTeam,
        designSpecifications,
        attachmentUrls,
        company: companyName,
        inspectionResult,
        inspectionComments,
        inspectionChecklist,
        ncrReason,
        ncrImageUrls,
        ncrResubmissions,
      },
    });
  } catch (err) {
    console.error('GET /api/tickets/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load ticket' },
      { status: 500 }
    );
  }
}
