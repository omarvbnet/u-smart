import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-require';

function bucketByDate(dates: Date[], days = 30): { date: string; count: number }[] {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const dt of dates) {
    const key = dt.toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

function tally(rows: { key: string; count: number }[], key: string) {
  const i = rows.findIndex((r) => r.key === key);
  if (i >= 0) rows[i].count++;
  else rows.push({ key, count: 1 });
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ success: false, message: admin.message }, { status: admin.status });
  }

  try {
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get('days') ?? '30', 10) || 30));

    const [
      requesters,
      provisorTickets,
      regPending,
      regApproved,
      companyReqPending,
      privateCoPending,
    ] = await Promise.all([
      prisma.ticketRequester.findMany({
        select: {
          id: true,
          role: true,
          status: true,
          province: true,
          createdAt: true,
          privateCompanyId: true,
        },
      }),
      prisma.visitorRequest.findMany({
        where: { serviceSlug: 'quality-control-supervision' },
        select: {
          id: true,
          status: true,
          province: true,
          taskCategory: true,
          assignmentScope: true,
          privateCompanyId: true,
          createdAt: true,
          requester: { select: { role: true } },
        },
      }),
      prisma.registrationRequest.count({ where: { status: 'PENDING' } }),
      prisma.registrationRequest.count({ where: { status: 'APPROVED' } }),
      prisma.companyRequest.count({ where: { status: 'PENDING' } }),
      prisma.privateCompany.count({ where: { status: 'PENDING' } }),
    ]);

    const usersByRole: { key: string; count: number }[] = [];
    const usersByStatus: { key: string; count: number }[] = [];
    const usersByProvince: { key: string; count: number }[] = [];
    const workspaceStaff = { withWorkspace: 0, withoutWorkspace: 0 };

    for (const u of requesters) {
      tally(usersByRole, String(u.role ?? 'COMPANY'));
      tally(usersByStatus, String(u.status ?? 'ACTIVE'));
      const prov = (u.province ?? '').trim() || 'Unknown';
      tally(usersByProvince, prov);
      if (u.privateCompanyId) workspaceStaff.withWorkspace++;
      else workspaceStaff.withoutWorkspace++;
    }

    usersByRole.sort((a, b) => b.count - a.count);
    usersByStatus.sort((a, b) => b.count - a.count);
    usersByProvince.sort((a, b) => b.count - a.count);

    const registrationTrend = bucketByDate(
      requesters.map((r) => r.createdAt),
      days
    );

    const ticketsByStatus: { key: string; count: number }[] = [];
    const ticketsByProvince: { key: string; count: number }[] = [];
    const ticketsByCategory: { key: string; count: number }[] = [];
    const ticketsByRequesterRole: { key: string; count: number }[] = [];
    const ticketsByScope: { key: string; count: number }[] = [];
    let pendingProvisor = 0;

    for (const t of provisorTickets) {
      const st = String(t.status ?? 'PENDING');
      tally(ticketsByStatus, st);
      if (st === 'PENDING') pendingProvisor++;
      tally(ticketsByProvince, (t.province ?? '').trim() || 'Unknown');
      const cat = t.taskCategory ? String(t.taskCategory) : 'UNSET';
      tally(ticketsByCategory, cat);
      tally(ticketsByRequesterRole, String(t.requester?.role ?? 'UNKNOWN'));
      if (t.assignmentScope) tally(ticketsByScope, String(t.assignmentScope));
    }

    const ticketTrend = bucketByDate(
      provisorTickets.map((t) => t.createdAt),
      days
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalRequesters: requesters.length,
        activeUsers: usersByStatus.find((x) => x.key === 'ACTIVE')?.count ?? 0,
        suspendedUsers: usersByStatus.find((x) => x.key === 'SUSPENDED')?.count ?? 0,
        blockedUsers: usersByStatus.find((x) => x.key === 'BLOCKED')?.count ?? 0,
        totalProvisorTickets: provisorTickets.length,
        pendingProvisorTickets: pendingProvisor,
        pendingRegistrationRequests: regPending,
        approvedRegistrationRequests: regApproved,
        pendingCompanyRequests: companyReqPending,
        pendingPrivateWorkspaces: privateCoPending,
        workspaceStaff,
      },
      usersByRole,
      usersByStatus,
      usersByProvince,
      registrationTrend,
      provisorTicketsByStatus: ticketsByStatus.sort((a, b) => b.count - a.count),
      provisorTicketsByProvince: ticketsByProvince.sort((a, b) => b.count - a.count),
      provisorTicketsByCategory: ticketsByCategory.sort((a, b) => b.count - a.count),
      provisorTicketsByRequesterRole: ticketsByRequesterRole.sort((a, b) => b.count - a.count),
      provisorTicketsByAssignmentScope: ticketsByScope.sort((a, b) => b.count - a.count),
      provisorTicketTrend: ticketTrend,
      roleHandlingNotes: {
        engineers:
          'Engineers (ENGINEER / QUALITY_ENGINEER / SUPERVISION_ENGINEER): inspection (QUALITY) and supervision tickets by province; company, personal, and workspace-scoped when assignment is open to all Provisor systems.',
        technicians:
          'Technicians (TECHNICIAN): maintenance tickets (MAINTENANCE) by province; same requester-role and workspace rules as engineers.',
      },
    });
  } catch (err) {
    console.error('GET /api/admin/analytics:', err);
    return NextResponse.json({ success: false, message: 'Failed to load analytics' }, { status: 500 });
  }
}
