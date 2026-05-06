import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import { rowToConflictPayload } from '@/lib/qc-conflict-mapper';

const prisma = _prisma as any;

const OPEN_STATUSES = new Set(['pending', 're_inspection']);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = (searchParams.get('status') ?? 'all').toLowerCase();
  const kindFilter = (searchParams.get('kind') ?? 'all').toLowerCase();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const serviceSlugParam = searchParams.get('serviceSlug')?.trim();

  try {
    const rows = await prisma.visitorRequest.findMany({
      where: {
        company: { contains: 'conflictReported' },
        ...(serviceSlugParam ? { serviceSlug: serviceSlugParam } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        company: true,
        technique: true,
        serviceSlug: true,
        status: true,
        updatedAt: true,
      },
    });

    let conflicts = rows.map((r: unknown) => rowToConflictPayload(r)).filter(Boolean) as Record<
      string,
      unknown
    >[];

    if (q) {
      conflicts = conflicts.filter((c) => {
        const site = ((c.siteName as string) ?? '').toLowerCase();
        const coord = ((c.siteCoordinator as string) ?? '').toLowerCase();
        const tid = ((c.ticketId as string) ?? '').toLowerCase();
        return site.includes(q) || coord.includes(q) || tid.includes(q);
      });
    }

    if (kindFilter === 'maintenance') {
      conflicts = conflicts.filter((c) => c.isMaintenanceConflict === true);
    } else if (kindFilter === 'qc') {
      conflicts = conflicts.filter((c) => c.isMaintenanceConflict !== true);
    }

    const countsBase = [...conflicts];
    if (statusFilter !== 'all') {
      conflicts = conflicts.filter((c) => {
        const s = String(c.status ?? 'pending').toLowerCase();
        if (statusFilter === 'pending') return s === 'pending';
        if (statusFilter === 'resolved') return s === 'resolved';
        if (statusFilter === 're_inspection') return s === 're_inspection';
        return true;
      });
    }

    const countByStatus = { pending: 0, resolved: 0, re_inspection: 0, other: 0 };
    for (const c of countsBase) {
      const s = String(c.status ?? 'pending').toLowerCase();
      if (s === 'pending') countByStatus.pending++;
      else if (s === 'resolved') countByStatus.resolved++;
      else if (s === 're_inspection') countByStatus.re_inspection++;
      else countByStatus.other++;
    }

    const openCount =
      countsBase.filter((c) => OPEN_STATUSES.has(String(c.status ?? 'pending').toLowerCase())).length;
    const maintenanceCount = countsBase.filter((c) => c.isMaintenanceConflict === true).length;
    const qcCount = countsBase.filter((c) => c.isMaintenanceConflict !== true).length;

    return NextResponse.json({
      success: true,
      conflicts,
      counts: {
        total: countsBase.length,
        open: openCount,
        pending: countByStatus.pending,
        resolved: countByStatus.resolved,
        reInspection: countByStatus.re_inspection,
        maintenance: maintenanceCount,
        qc: qcCount,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/conflicts:', err);
    return NextResponse.json({ success: false, message: 'Failed to load conflicts' }, { status: 500 });
  }
}
