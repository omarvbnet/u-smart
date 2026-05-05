import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { coordinatorRoleTicketWhere } from '@/lib/linked-coordinator-company';
const prisma = _prisma as any;

const CONFLICT_RESULTS = ['not_accepted', 'ncr', 'accepted_with_comments'];
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

function rowToConflict(row: any): any {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    return null;
  }
  if (parsed.conflictReported !== true) return null;
  const technique = (row.technique ?? '').toLowerCase();
  const isMaintenance = MAINTENANCE_TECHNIQUES.includes(technique);
  const inspectionResult = isMaintenance ? 'maintenance' : ((parsed.inspectionResult as string) ?? 'not_accepted');
  if (!isMaintenance && !CONFLICT_RESULTS.includes(inspectionResult.toLowerCase())) return null;

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
    conflictReportComment: parsed.conflictReportComment ?? null,
    reportedBy: parsed.conflictReportedBy ?? null,
    reportedAt: parsed.conflictReportedAt ?? null,
    isMaintenanceConflict: isMaintenance,
  };
  if (isMaintenance && Array.isArray(parsed.conflictImageUrls)) {
    out.conflictImageUrls = parsed.conflictImageUrls.filter((u: unknown) => typeof u === 'string');
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const coordinatorContext = await getCoordinatorContext(req);

  let requesterRole = 'COMPANY';
  if (!coordinatorContext) {
    try {
      const reqRow = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true, serviceSlug: true },
      });
      requesterRole = reqRow?.role ?? 'COMPANY';
    } catch {
      /* ignore */
    }
  }

  const { searchParams } = new URL(req.url);
  const serviceSlug = searchParams.get('serviceSlug')?.trim()?.toLowerCase()
    || 'quality-control-supervision';

  try {
    let where: any;
    if (coordinatorContext) {
      where = {
        ...coordinatorRoleTicketWhere(
          coordinatorContext.companyId,
          coordinatorContext.role,
          coordinatorContext.departments
        ),
        serviceSlug,
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'PENDING'] },
        company: { contains: 'conflictReported' },
      };
    } else {
      const isRequester = requesterRole === 'COMPANY' || requesterRole === 'PERSONAL';
      where = {
        serviceSlug,
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'PENDING'] },
        AND: [
          { company: { contains: 'conflictReported' } },
          isRequester
            ? { requesterId: auth.payload.requesterId }
            : { company: { contains: auth.payload.requesterId } },
        ],
      };
    }

    const rows = await prisma.visitorRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, company: true, technique: true },
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
