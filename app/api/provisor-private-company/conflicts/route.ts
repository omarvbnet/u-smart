import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { rowToConflictPayload } from '@/lib/qc-conflict-mapper';
import {
  getWorkspaceConflictManageContext,
  ticketInWorkspaceConflictScope,
} from '@/lib/private-company-conflict-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const OPEN_CONFLICT_STATUSES = new Set(['pending', 're_inspection']);

function enrichConflict(
  base: Record<string, unknown>,
  row: {
    privateCompanyTargetDepartmentId?: string | null;
    status?: string;
    technique?: string | null;
  },
  deptNames: Map<string, string>,
  reporterNames: Map<string, string>
): Record<string, unknown> {
  const deptId = row.privateCompanyTargetDepartmentId ?? null;
  const reportedBy = typeof base.reportedBy === 'string' ? base.reportedBy : null;
  return {
    ...base,
    ticketStatus: row.status ?? null,
    privateCompanyTargetDepartmentId: deptId,
    targetDepartmentName: deptId ? deptNames.get(deptId) ?? null : null,
    reportedByName: reportedBy ? reporterNames.get(reportedBy) ?? null : null,
  };
}

/**
 * GET /api/provisor-private-company/conflicts
 * Workspace owner: all conflict cases on PRIVATE_COMPANY_STAFF tickets.
 * Manager / coordinator: same department only.
 * Query: status=open|all (default open)
 */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const ctx = await getWorkspaceConflictManageContext(auth.payload.requesterId);
  if (!ctx) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner or a department manager/coordinator can view conflicts.',
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const statusFilter = (url.searchParams.get('status') ?? 'open').trim().toLowerCase();

  try {
    const rows = await prisma.visitorRequest.findMany({
      where: {
        privateCompanyId: ctx.companyId,
        assignmentScope: 'PRIVATE_COMPANY_STAFF',
        company: { contains: 'conflictReported' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        company: true,
        technique: true,
        status: true,
        privateCompanyTargetDepartmentId: true,
      },
    });

    const scoped = (rows as Array<{
      id: string;
      company: string | null;
      technique: string | null;
      status: string;
      privateCompanyTargetDepartmentId: string | null;
    }>).filter((r) =>
      ticketInWorkspaceConflictScope(
        {
          privateCompanyId: ctx.companyId,
          privateCompanyTargetDepartmentId: r.privateCompanyTargetDepartmentId,
        },
        ctx
      )
    );

    const deptRows = await prisma.privateCompanyDepartment.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, name: true },
    });
    const deptNames = new Map(
      (deptRows as Array<{ id: string; name: string }>).map((d) => [d.id, d.name])
    );

    const reporterIds = new Set<string>();
    for (const r of scoped) {
      try {
        const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {};
        const rb = parsed.conflictReportedBy;
        if (typeof rb === 'string' && rb.trim()) reporterIds.add(rb.trim());
      } catch {
        /* ignore */
      }
    }
    const reporterNames = new Map<string, string>();
    if (reporterIds.size > 0) {
      const reporters = await prisma.ticketRequester.findMany({
        where: { id: { in: [...reporterIds] } },
        select: { id: true, name: true, username: true },
      });
      for (const u of reporters as Array<{ id: string; name: string | null; username: string }>) {
        reporterNames.set(u.id, (u.name ?? u.username ?? u.id).trim());
      }
    }

    let conflicts = scoped
      .map((r) => {
        const mapped = rowToConflictPayload(r);
        if (!mapped) return null;
        return enrichConflict(mapped, r, deptNames, reporterNames);
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    const pendingCount = conflicts.filter((c) =>
      OPEN_CONFLICT_STATUSES.has(String(c.status ?? 'pending').toLowerCase())
    ).length;

    if (statusFilter === 'open') {
      conflicts = conflicts.filter((c) =>
        OPEN_CONFLICT_STATUSES.has(String(c.status ?? 'pending').toLowerCase())
      );
    }

    return NextResponse.json({
      success: true,
      conflicts,
      pendingCount,
      scope: ctx.isOwner ? 'workspace' : 'department',
    });
  } catch (err) {
    console.error('GET /api/provisor-private-company/conflicts:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load workspace conflicts.' },
      { status: 500 }
    );
  }
}
