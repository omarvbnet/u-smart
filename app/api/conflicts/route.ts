import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { coordinatorRoleTicketWhere } from '@/lib/linked-coordinator-company';
import { rowToConflictPayload } from '@/lib/qc-conflict-mapper';
const prisma = _prisma as any;

/** Conflict cases that are still actionable (not resolved). */
const OPEN_CONFLICT_STATUSES = new Set(['pending', 're_inspection']);

function rowToConflict(row: unknown): Record<string, unknown> | null {
  const mapped = rowToConflictPayload(row);
  if (!mapped) return null;
  delete mapped.resolutionComment;
  delete mapped.serviceSlug;
  delete mapped.updatedAt;
  return mapped;
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
      const engineerId = auth.payload.requesterId;
      // Engineers: only tickets where this engineer is assigned (assignedEngineerId in company JSON).
      const assignedToThisEngineer = {
        company: { contains: `"assignedEngineerId":"${engineerId}"` },
      } as const;
      where = {
        serviceSlug,
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'PENDING'] },
        AND: [
          { company: { contains: 'conflictReported' } },
          isRequester
            ? { requesterId: engineerId }
            : requesterRole === 'ENGINEER'
              ? assignedToThisEngineer
              : { company: { contains: engineerId } },
        ],
      };
    }

    const rows = await prisma.visitorRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, company: true, technique: true },
    });

    let conflicts = rows
      .map((r: any) => rowToConflict(r))
      .filter(Boolean)
      .filter((c: any) => c !== null);

    // Engineers: inbox is only open cases on tickets they handled (DB filter + status).
    if (!coordinatorContext && requesterRole === 'ENGINEER') {
      conflicts = conflicts.filter(
        (c: any) => c && OPEN_CONFLICT_STATUSES.has(String(c.status ?? 'pending').toLowerCase())
      );
    }

    return NextResponse.json({ success: true, conflicts });
  } catch (err) {
    console.error('GET /api/conflicts:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch conflicts' },
      { status: 500 }
    );
  }
}
