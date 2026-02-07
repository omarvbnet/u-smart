import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRequesterToken, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(REQUESTER_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const payload = verifyRequesterToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { serviceSlug: true },
    });
    if (!requester) {
      return NextResponse.json(
        { success: false, message: 'Requester not found' },
        { status: 401 }
      );
    }
    const requesterServiceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const siteNameParam = searchParams.get('siteName')?.trim() || undefined;
    const dashboardSlug = searchParams.get('serviceSlug')?.trim()?.toLowerCase() || undefined;
    const validSlugs = ['quality-control-supervision', 'enterprise-networking'];
    const filterServiceSlug = dashboardSlug && validSlugs.includes(dashboardSlug)
      ? dashboardSlug
      : requesterServiceSlug;

    const where: { requesterId: string; serviceSlug?: string; createdAt?: { gte?: Date; lte?: Date }; OR?: Array<{ siteName?: { contains: string; mode: 'insensitive' }; company?: { contains: string } }> } = {
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
      where.OR = [{ company: { contains: siteNameParam } }];
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
      const baseWhere: { requesterId: string; serviceSlug: string; OR?: Array<{ company?: { contains: string } }> } = {
        requesterId: payload.requesterId,
        serviceSlug: 'quality-control-supervision',
      };
      if (siteNameParam) baseWhere.OR = [{ company: { contains: siteNameParam } }];

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
