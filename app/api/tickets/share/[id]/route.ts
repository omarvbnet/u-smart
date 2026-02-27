import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';

const prisma = _prisma as any;

/**
 * Public API: returns ticket details by ID.
 * No authentication required - anyone with the ticket ID can view.
 * Used for QR code sharing.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    let row: any;
    try {
      row = await prisma.visitorRequest.findFirst({
        where: { id },
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
    } catch {
      row = await prisma.visitorRequest.findFirst({
        where: { id },
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

    const logs = await prisma.ticketStatusLog.findMany({
      where: { visitorRequestId: id },
      orderBy: { createdAt: 'asc' },
      select: { status: true, createdAt: true },
    });

    let siteName: string | null = null;
    let siteCoordinator: string | null = null;
    let slaHours: number | null = null;
    let status = row.status ?? 'PENDING';
    let completedAt: string | null = row.completedAt ? String(row.completedAt) : null;
    let designSpecifications: string | null = null;
    let attachmentUrls: string[] = [];
    let inspectionResult: string | null = null;
    let inspectionComments: string | null = null;
    let inspectionChecklist: Array<{ id: string; label: string; checked: boolean; result?: string; comment?: string }> = [];
    let ncrReason: string | null = null;
    let ncrImageUrls: string[] = [];
    let ncrResubmissions: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }> = [];
    let assignedEngineerId: string | null = null;
    let assignedEngineerName: string | null = null;
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
            .map((c: { id: string; label: string; checked: boolean; comment?: string; weight?: string; result?: string }) => ({
              id: c.id,
              label: c.label,
              checked: !!c.checked,
              result: typeof c.result === 'string' ? c.result : (c.checked ? 'accepted' : 'rejected'),
              comment: c.comment,
              weight: c.weight === 'major' ? 'major' : 'minor',
            }))
          : [];
        ncrReason = (parsed.ncrReason as string) ?? null;
        ncrImageUrls = Array.isArray(parsed.ncrImageUrls) ? parsed.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];
        ncrResubmissions = Array.isArray(parsed.ncrResubmissions)
          ? (parsed.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({ at: e.at || '', by: e.by || '', action: e.action || 'resubmit', comment: e.comment ?? null, imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [] }))
          : [];
      }
      assignedEngineerId = typeof (parsed as { assignedEngineerId?: string }).assignedEngineerId === 'string' ? (parsed as { assignedEngineerId: string }).assignedEngineerId : null;
      assignedEngineerName = typeof (parsed as { assignedEngineerName?: string }).assignedEngineerName === 'string' ? (parsed as { assignedEngineerName: string }).assignedEngineerName : null;
    } catch {
      /* ignore */
    }

    type TimelineEntry = { status: string; createdAt: Date | string };
    const statusTimeline: TimelineEntry[] =
      logs.length > 0
        ? logs.map((e: TimelineEntry) => ({ status: e.status, createdAt: e.createdAt }))
        : [{ status: status as string, createdAt: row.createdAt }];

    const maintenanceDescription = (row as any).maintenanceDescription ?? null;
    const beforeImageUrls = Array.isArray((row as any).beforeImageUrls) ? (row as any).beforeImageUrls : [];
    const finishingImageUrls = Array.isArray((row as any).finishingImageUrls) ? (row as any).finishingImageUrls : [];

    const commentsRows = await prisma.ticketComment.findMany({
      where: { visitorRequestId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, authorId: true, authorName: true, body: true, createdAt: true },
    });
    const authorIds = [...new Set(commentsRows.map((c: { authorId: string }) => c.authorId))];
    const requesters = authorIds.length > 0
      ? await prisma.ticketRequester.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, role: true },
        })
      : [];
    const roleByAuthor: Record<string, string> = {};
    for (const r of requesters) {
      roleByAuthor[r.id] = r.role === 'ENGINEER' ? 'engineer' : 'requester';
    }
    const comments = commentsRows.map((c: { id: string; authorId: string; authorName: string; body: string; createdAt: Date }) => ({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
      authorRole: roleByAuthor[c.authorId] ?? 'requester',
    }));
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
        statusTimeline: statusTimeline.map((e: TimelineEntry) => ({ status: e.status, createdAt: e.createdAt })),
        maintenanceDescription,
        beforeImageUrls,
        finishingImageUrls,
        assignedTeam,
        designSpecifications,
        attachmentUrls,
        inspectionResult,
        inspectionComments,
        inspectionChecklist,
        ncrReason,
        ncrImageUrls,
        ncrResubmissions,
        assignedEngineerId,
        assignedEngineerName,
        comments,
      },
    });
  } catch (err) {
    console.error('GET /api/tickets/share/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load ticket' },
      { status: 500 }
    );
  }
}
