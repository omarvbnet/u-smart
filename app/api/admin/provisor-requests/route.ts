import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin-require';

function pickCompany(val: unknown): string | null {
  if (typeof val === 'string' && val.trim()) return val.trim();
  return null;
}

function fromJsonCompany(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (!s.startsWith('{')) return s;
  try {
    const p = JSON.parse(s) as Record<string, unknown>;
    return pickCompany(p.company) ?? pickCompany(p.companyName);
  } catch {
    return s;
  }
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ success: false, message: admin.message }, { status: admin.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status')?.trim().toUpperCase() || '';
    const provinceFilter = searchParams.get('province')?.trim() || '';
    const taskCategoryFilter = searchParams.get('taskCategory')?.trim().toUpperCase() || '';
    const requesterRoleFilter = searchParams.get('requesterRole')?.trim().toUpperCase() || '';
    const assignmentScopeFilter = searchParams.get('assignmentScope')?.trim().toUpperCase() || '';
    const techniqueFilter = searchParams.get('technique')?.trim().toLowerCase() || '';
    const q = searchParams.get('q')?.trim().toLowerCase() || '';
    const dateFrom = searchParams.get('dateFrom')?.trim() || '';
    const dateTo = searchParams.get('dateTo')?.trim() || '';

    const where: Record<string, unknown> = {
      serviceSlug: 'quality-control-supervision',
    };
    if (statusFilter) where.status = statusFilter;
    if (provinceFilter) where.province = { equals: provinceFilter, mode: 'insensitive' };
    if (taskCategoryFilter) where.taskCategory = taskCategoryFilter;
    if (assignmentScopeFilter) where.assignmentScope = assignmentScopeFilter;
    if (techniqueFilter) where.technique = { contains: techniqueFilter, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await prisma.visitorRequest.findMany({
      where: where as never,
      include: {
        requester: {
          select: {
            id: true,
            role: true,
            name: true,
            company: true,
            province: true,
            privateCompanyId: true,
            companyProfile: { select: { companyName: true } },
          },
        },
        privateCompany: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    let requests = rows.map((r) => {
      const jCompany = fromJsonCompany(r.company);
      const displayCompany =
        jCompany ??
        r.requester?.companyProfile?.companyName ??
        r.requester?.company ??
        r.privateCompany?.name ??
        null;
      return {
        id: r.id,
        status: r.status,
        technique: r.technique,
        taskCategory: r.taskCategory,
        roleScope: r.roleScope,
        assignmentScope: r.assignmentScope,
        province: r.province,
        phone: r.phone,
        name: r.name,
        email: r.email,
        siteName: r.siteName,
        siteCoordinator: r.siteCoordinator,
        displayCompany,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        privateCompanyId: r.privateCompanyId,
        privateCompanyName: r.privateCompany?.name ?? null,
        requesterId: r.requesterId,
        requesterRole: r.requester?.role ?? null,
        requesterName: r.requester?.name ?? null,
        requesterProvince: r.requester?.province ?? null,
      };
    });

    if (requesterRoleFilter) {
      requests = requests.filter((r) => (r.requesterRole ?? '').toUpperCase() === requesterRoleFilter);
    }
    if (q) {
      requests = requests.filter((r) => {
        const hay = [
          r.id,
          r.siteName,
          r.siteCoordinator,
          r.displayCompany,
          r.phone,
          r.name,
          r.province,
          r.technique,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const allForCounts = await prisma.visitorRequest.findMany({
      where: { serviceSlug: 'quality-control-supervision' },
      select: { status: true, taskCategory: true },
    });

    const pendingByStatus: Record<string, number> = {};
    const pendingByCategory: Record<string, number> = {
      QUALITY: 0,
      SUPERVISION: 0,
      MAINTENANCE: 0,
      UNSET: 0,
    };
    let pendingTotal = 0;

    for (const t of allForCounts) {
      const st = String(t.status ?? 'PENDING');
      pendingByStatus[st] = (pendingByStatus[st] ?? 0) + 1;
      if (st !== 'PENDING') continue;
      pendingTotal++;
      const cat = t.taskCategory ? String(t.taskCategory) : 'UNSET';
      if (cat in pendingByCategory) {
        pendingByCategory[cat as keyof typeof pendingByCategory]++;
      } else {
        pendingByCategory.UNSET++;
      }
    }

    return NextResponse.json({
      success: true,
      requests,
      counts: {
        total: allForCounts.length,
        filtered: requests.length,
        pendingTotal,
        pendingByStatus,
        pendingByCategory,
      },
    });
  } catch (err) {
    console.error('GET /api/admin/provisor-requests:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch provisor requests' }, { status: 500 });
  }
}
