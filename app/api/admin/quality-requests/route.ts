import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function pickCompany(val: unknown): string | null {
  if (typeof val === 'string' && val.trim()) return val.trim();
  return null;
}

function fromJson(raw: string | null): {
  company: string | null;
  siteName?: string;
  siteCoordinator?: string;
  slaHours?: number;
  inspectionResult?: string;
  ncrReason?: string | null;
  ncrImageUrls?: string[];
  ncrResubmissions?: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }>;
} {
  const empty = {
    company: null as string | null,
    siteName: undefined as string | undefined,
    siteCoordinator: undefined as string | undefined,
    slaHours: undefined as number | undefined,
    inspectionResult: undefined as string | undefined,
    ncrReason: undefined as string | null | undefined,
    ncrImageUrls: undefined as string[] | undefined,
    ncrResubmissions: undefined as Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }> | undefined,
  };
  if (!raw || typeof raw !== 'string') return empty;
  const s = raw.trim();
  if (!s) return empty;
  if (!s.startsWith('{')) return { ...empty, company: s || null };
  try {
    const p = JSON.parse(s) as Record<string, unknown>;
    const ncrResubmissions = Array.isArray(p.ncrResubmissions)
      ? (p.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({
          at: e.at || '',
          by: e.by || '',
          action: e.action || 'resubmit',
          comment: e.comment ?? null,
          imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [],
        }))
      : undefined;
    return {
      company: pickCompany(p.company as string) ?? pickCompany(p.companyName as string),
      siteName: typeof p.siteName === 'string' ? p.siteName : undefined,
      siteCoordinator: typeof p.siteCoordinator === 'string' ? p.siteCoordinator : undefined,
      slaHours: typeof p.slaHours === 'number' ? p.slaHours : undefined,
      inspectionResult: typeof p.inspectionResult === 'string' ? p.inspectionResult : undefined,
      ncrReason: typeof p.ncrReason === 'string' ? p.ncrReason : p.ncrReason === null ? null : undefined,
      ncrImageUrls: Array.isArray(p.ncrImageUrls) ? (p.ncrImageUrls as string[]).filter((u: unknown) => typeof u === 'string') : undefined,
      ncrResubmissions,
    };
  } catch {
    return { ...empty, company: s || null };
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const resultFilter = searchParams.get('result')?.trim().toLowerCase() || '';
    const statusFilter = searchParams.get('status')?.trim().toUpperCase() || '';
    const idFilter = searchParams.get('id')?.trim() || '';
    const siteIdFilter = searchParams.get('siteId')?.trim() || '';
    const companyFilter = searchParams.get('company')?.trim() || '';

    const rows = await prisma.visitorRequest.findMany({
      where: { serviceSlug: 'quality-control-supervision' },
      include: {
        requester: {
          select: {
            company: true,
            companyProfile: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let enriched = rows.map((r) => {
      const j = fromJson(r.company);
      const requesterCompany = r.requester?.company ?? null;
      const profileCompany = r.requester?.companyProfile?.companyName ?? null;
      const displayCompany =
        pickCompany(j.company) ??
        pickCompany(profileCompany) ??
        pickCompany(requesterCompany) ??
        null;
      return {
        id: r.id,
        status: r.status,
        technique: r.technique,
        phone: r.phone,
        province: r.province,
        name: r.name,
        email: r.email,
        createdAt: r.createdAt,
        siteName: j.siteName ?? r.siteName ?? null,
        siteCoordinator: j.siteCoordinator ?? r.siteCoordinator ?? null,
        slaHours: j.slaHours ?? r.slaHours ?? null,
        displayCompany,
        inspectionResult: j.inspectionResult ?? null,
        ncrReason: j.ncrReason ?? null,
        ncrImageUrls: j.ncrImageUrls ?? [],
        ncrResubmissions: j.ncrResubmissions ?? [],
      };
    });

    const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

    const pendingNcrResubmitCount = enriched.filter((r) => {
      if ((r.status || '').toUpperCase() === 'COMPLETED') return false;
      if ((r.inspectionResult || '').toLowerCase() !== 'ncr') return false;
      const subs = r.ncrResubmissions || [];
      if (subs.length === 0) return false;
      const last = subs[subs.length - 1];
      return last.by === 'requester' && last.action === 'resubmit';
    }).length;

    if (resultFilter) {
      enriched = enriched.filter((r) => (r.inspectionResult || '').toLowerCase() === resultFilter);
    }
    if (statusFilter) {
      enriched = enriched.filter((r) => (r.status || '').toUpperCase() === statusFilter);
    }
    if (idFilter) {
      enriched = enriched.filter((r) => r.id.toLowerCase().includes(idFilter.toLowerCase()));
    }
    if (siteIdFilter) {
      enriched = enriched.filter(
        (r) =>
          (r.siteName || '').toLowerCase().includes(siteIdFilter.toLowerCase()) ||
          (r.siteCoordinator || '').toLowerCase().includes(siteIdFilter.toLowerCase())
      );
    }
    if (companyFilter) {
      const cf = companyFilter.toLowerCase();
      enriched = enriched.filter((r) =>
        (r.displayCompany || '').toLowerCase().includes(cf)
      );
    }

    return NextResponse.json({
      success: true,
      requests: enriched,
      pendingCount,
      pendingNcrResubmitCount,
      total: rows.length,
    });
  } catch (err) {
    console.error('GET /api/admin/quality-requests:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch' }, { status: 500 });
  }
}
