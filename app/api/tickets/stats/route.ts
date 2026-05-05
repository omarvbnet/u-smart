import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getLinkedCoordinatorCompanyId, coordinatorRoleTicketWhere } from '@/lib/linked-coordinator-company';

export async function GET(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }
    const payload = auth.payload;
    const coordinatorContext = await getCoordinatorContext(req);

    if (coordinatorContext) {
      const rows = await (prisma as any).visitorRequest.findMany({
        where: coordinatorRoleTicketWhere(
          coordinatorContext.companyId,
          coordinatorContext.role,
          coordinatorContext.departments
        ),
        select: {
          status: true,
          taskCategory: true,
          roleScope: true,
          assigneeCoordinatorUserId: true,
          workflowState: true,
          createdAt: true,
          completedAt: true,
          company: true,
        },
      });
      let withinSla = 0;
      let outOfSla = 0;
      const now = Date.now();
      const ticketsByRoleScope: Record<string, number> = {};
      const ticketsByCategory: Record<string, number> = {};
      const ticketsByStatus: Record<string, number> = {};
      for (const r of rows as any[]) {
        ticketsByRoleScope[r.roleScope ?? 'ANY'] = (ticketsByRoleScope[r.roleScope ?? 'ANY'] ?? 0) + 1;
        ticketsByCategory[r.taskCategory ?? 'UNSPECIFIED'] = (ticketsByCategory[r.taskCategory ?? 'UNSPECIFIED'] ?? 0) + 1;
        ticketsByStatus[r.status ?? 'PENDING'] = (ticketsByStatus[r.status ?? 'PENDING'] ?? 0) + 1;

        let slaHours = 24;
        try {
          const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {};
          if (parsed._ticket && typeof parsed.slaHours === 'number') slaHours = parsed.slaHours;
        } catch {
          /* ignore */
        }
        const created = new Date(r.createdAt).getTime();
        const completed = r.completedAt ? new Date(r.completedAt).getTime() : null;
        if (r.status === 'COMPLETED' && completed != null) {
          const hoursTaken = (completed - created) / (1000 * 60 * 60);
          if (hoursTaken <= slaHours) withinSla++;
          else outOfSla++;
        } else {
          const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
          if (hoursSinceCreation > slaHours) outOfSla++;
        }
      }

      let usersByRole: Record<string, number> = {};
      try {
        const staff = await (prisma as any).coordinatorUser.findMany({
          where: { companyId: coordinatorContext.companyId },
          select: { role: true },
        });
        for (const u of staff as { role?: string }[]) {
          const k = String(u.role ?? 'UNKNOWN');
          usersByRole[k] = (usersByRole[k] ?? 0) + 1;
        }
      } catch {
        usersByRole = {};
      }

      return NextResponse.json({
        success: true,
        stats: {
          withinSla,
          outOfSla,
          total: withinSla + outOfSla,
          ticketsByRoleScope,
          ticketsByCategory,
          ticketsByStatus,
          usersByRole,
        },
      });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { serviceSlug: true, role: true, username: true, email: true },
    });
    if (!requester) {
      return NextResponse.json(
        { success: false, message: 'Requester not found' },
        { status: 401 }
      );
    }
    const requesterServiceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';
    const requesterRole = (requester as { role?: string }).role ?? 'COMPANY';
    const linkedCompanyId =
      requesterRole === 'COMPANY'
        ? await getLinkedCoordinatorCompanyId(prisma, {
            id: payload.requesterId,
            username: (requester as { username?: string }).username ?? '',
            email: (requester as { email?: string | null }).email ?? null,
            role: requesterRole,
          })
        : null;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const siteNameParam = searchParams.get('siteName')?.trim() || undefined;
    const dashboardSlug = searchParams.get('serviceSlug')?.trim()?.toLowerCase() || undefined;
    const validSlugs = ['quality-control-supervision', 'enterprise-networking'];
    const filterServiceSlug = dashboardSlug && validSlugs.includes(dashboardSlug)
      ? dashboardSlug
      : requesterServiceSlug;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = linkedCompanyId
      ? {
          serviceSlug: filterServiceSlug,
          OR: [{ requesterId: payload.requesterId }, { coordinatorCompanyId: linkedCompanyId }],
        }
      : {
          requesterId: payload.requesterId,
          serviceSlug: filterServiceSlug,
        };
    if (from) {
      const d = new Date(from);
      d.setHours(0, 0, 0, 0);
      where.createdAt = { ...(where.createdAt as object), gte: d };
    }
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      where.createdAt = { ...(where.createdAt as object), lte: d };
    }
    if (siteNameParam) {
      const siteClause = { OR: [{ company: { contains: siteNameParam } }] };
      if (where.AND && Array.isArray(where.AND)) {
        where.AND.push(siteClause);
      } else {
        where.AND = [siteClause];
      }
    }

    const rows = await prisma.visitorRequest.findMany({
      where,
      select: {
        status: true,
        company: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    let withinSla = 0;
    let outOfSla = 0;

    type InspectionCounts = { total: number; accepted: number; accepted_with_comments: number; not_accepted: number; ncr: number; in_progress: number };
    const countInspection = (r: { company: unknown; createdAt: Date }, acc: InspectionCounts) => {
      try {
        const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {} as Record<string, unknown>;
        if (parsed._ticket) {
          acc.total++;
          const result = (parsed.inspectionResult as string)?.toLowerCase?.() ?? '';
          if (result === 'accepted') acc.accepted++;
          else if (result === 'accepted_with_comments') acc.accepted_with_comments++;
          else if (result === 'not_accepted') acc.not_accepted++;
          else if (result === 'ncr') acc.ncr++;
          else if (result === 'in_progress') acc.in_progress++;
        }
      } catch { /* ignore */ }
    };

    let inspectionStats: InspectionCounts | undefined;
    let inspectionTrend: InspectionCounts | undefined;

    if (filterServiceSlug === 'quality-control-supervision') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseWhere: any = {
        serviceSlug: 'quality-control-supervision',
        AND: [
          linkedCompanyId
            ? { OR: [{ requesterId: payload.requesterId }, { coordinatorCompanyId: linkedCompanyId }] }
            : { requesterId: payload.requesterId },
        ],
      };
      if (siteNameParam) {
        baseWhere.AND.push({ OR: [{ company: { contains: siteNameParam } }] });
      }

      const currentFrom = from ? new Date(from) : new Date(now - 30 * 24 * 60 * 60 * 1000);
      const currentTo = to ? new Date(to) : new Date(now);
      currentFrom.setHours(0, 0, 0, 0);
      currentTo.setHours(23, 59, 59, 999);

      const prevEnd = new Date(currentFrom.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setHours(23, 59, 59, 999);

      const [currentRows, prevRows] = await Promise.all([
        prisma.visitorRequest.findMany({
          where: { ...baseWhere, createdAt: { gte: currentFrom, lte: currentTo } },
          select: { company: true, createdAt: true },
        }),
        prisma.visitorRequest.findMany({
          where: { ...baseWhere, createdAt: { gte: prevStart, lte: prevEnd } },
          select: { company: true, createdAt: true },
        }),
      ]);

      inspectionStats = { total: 0, accepted: 0, accepted_with_comments: 0, not_accepted: 0, ncr: 0, in_progress: 0 };
      inspectionTrend = { total: 0, accepted: 0, accepted_with_comments: 0, not_accepted: 0, ncr: 0, in_progress: 0 };
      currentRows.forEach((r) => countInspection(r, inspectionStats!));
      prevRows.forEach((r) => countInspection(r, inspectionTrend!));
    }

    for (const r of rows) {
      let siteName: string | null = null;
      let slaHours: number | null = null;
      let status: string = r.status ?? 'PENDING';
      let completedAt: Date | string | null = null;
      try {
        const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {} as Record<string, unknown>;
        if (parsed._ticket) {
          siteName = (parsed.siteName as string) ?? null;
          slaHours = (parsed.slaHours as number) ?? null;
          if (parsed.status) status = String(parsed.status);
          if (parsed.completedAt) completedAt = new Date(parsed.completedAt as string);
        }
      } catch {
        /* ignore */
      }

      if (siteNameParam && !siteName?.toLowerCase().includes(siteNameParam.toLowerCase())) continue;

      const sla = slaHours ?? 24;
      const created = r.createdAt.getTime();
      const completed = completedAt ? (completedAt instanceof Date ? completedAt.getTime() : new Date(completedAt).getTime()) : null;

      if (status === 'COMPLETED' && completed != null) {
        const hoursTaken = (completed - created) / (1000 * 60 * 60);
        if (hoursTaken <= sla) withinSla++;
        else outOfSla++;
      } else {
        const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
        if (hoursSinceCreation > sla) outOfSla++;
      }
    }

    const stats: { withinSla: number; outOfSla: number; total: number; inspectionStats?: InspectionCounts; inspectionTrend?: InspectionCounts } = {
      withinSla,
      outOfSla,
      total: withinSla + outOfSla,
    };
    if (inspectionStats) stats.inspectionStats = inspectionStats;
    if (inspectionTrend) stats.inspectionTrend = inspectionTrend;

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    const err = error as Error;
    console.error('GET /api/tickets/stats:', err?.message ?? err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
