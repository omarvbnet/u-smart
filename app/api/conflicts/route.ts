import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
const prisma = _prisma as any;

const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'];

function rowToConflict(row: any): any {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    return null;
  }
  if (parsed.conflictReported !== true) return null;
  const inspectionResult = (parsed.inspectionResult as string) ?? 'not_accepted';
  if (!CONFLICT_RESULTS.includes(inspectionResult.toLowerCase())) return null;
  return {
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
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  let requesterRole = 'COMPANY';
  try {
    const reqRow = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, serviceSlug: true },
    });
    requesterRole = reqRow?.role ?? 'COMPANY';
  } catch {
    /* ignore */
  }

  const { searchParams } = new URL(req.url);
  const serviceSlug = searchParams.get('serviceSlug')?.trim()?.toLowerCase()
    || 'quality-control-supervision';

  try {
    const where: any = {
      serviceSlug,
      status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      AND: [
        { company: { contains: 'conflictReported' } },
        requesterRole === 'COMPANY'
          ? { requesterId: auth.payload.requesterId }
          : { company: { contains: auth.payload.requesterId } },
      ],
    };

    const rows = await prisma.visitorRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, company: true },
    });

    const conflicts = rows
      .map((r: any) => rowToConflict(r))
      .filter(Boolean)
      .filter((c: any) => c !== null);

    return NextResponse.json({ success: true, conflicts });
  } catch (err) {
    console.error('GET /api/conflicts:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch conflicts' },
      { status: 500 }
    );
  }
}
