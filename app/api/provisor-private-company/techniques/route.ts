import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type OkCtx = { ok: true; requesterId: string; companyId: string };

async function requireWorkspaceOwnerForTechniques(req: NextRequest): Promise<
  OkCtx | { ok: false; response: NextResponse }
> {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }),
    };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId || m.ownedCompanyId !== m.effectiveCompanyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Only the workspace owner can manage workspace techniques.' },
        { status: 403 }
      ),
    };
  }
  if (m.ownedCompanyStatus !== 'APPROVED') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Workspace must be approved first.' },
        { status: 403 }
      ),
    };
  }
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true },
  });
  if (String(me?.role ?? '').toUpperCase() !== 'COMPANY') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Only the company owner account can manage workspace techniques.' },
        { status: 403 }
      ),
    };
  }
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { status: true },
  });
  if (!company || company.status !== 'APPROVED') {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 }),
    };
  }
  return { ok: true, requesterId: auth.payload.requesterId, companyId: m.effectiveCompanyId };
}

/** GET — list workspace-only techniques (owner management UI). */
export async function GET(req: NextRequest) {
  const ctx = await requireWorkspaceOwnerForTechniques(req);
  if (!ctx.ok) return ctx.response;

  try {
    const rows = await prisma.privateCompanyTechnique.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ success: true, techniques: rows });
  } catch (e) {
    console.error('GET /api/provisor-private-company/techniques:', e);
    return NextResponse.json({ success: false, message: 'Failed to load techniques' }, { status: 500 });
  }
}

/** POST — add a workspace technique (QC inspection or maintenance slug). */
export async function POST(req: NextRequest) {
  const ctx = await requireWorkspaceOwnerForTechniques(req);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await req.json();
    const category =
      body.category === 'MAINTENANCE' || body.category === 'INSPECTION_QC' ? body.category : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/\s+/g, '_') : '';
    const labelAr = typeof body.labelAr === 'string' ? body.labelAr.trim() : '';
    const labelEn = typeof body.labelEn === 'string' ? body.labelEn.trim() : undefined;
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;
    const active = body.active !== false;
    const departmentIdRaw =
      typeof body.departmentId === 'string' && body.departmentId.trim() ? body.departmentId.trim() : null;

    if (!category || !slug || !labelAr) {
      return NextResponse.json(
        { success: false, message: 'category, slug, and labelAr are required' },
        { status: 400 }
      );
    }

    if (departmentIdRaw) {
      const dept = await prisma.privateCompanyDepartment.findFirst({
        where: { id: departmentIdRaw, companyId: ctx.companyId },
        select: { id: true },
      });
      if (!dept) {
        return NextResponse.json(
          { success: false, message: 'Department not found in this workspace.' },
          { status: 400 }
        );
      }
    }

    const created = await prisma.privateCompanyTechnique.create({
      data: {
        companyId: ctx.companyId,
        category,
        slug,
        labelAr,
        labelEn: labelEn || null,
        sortOrder,
        active,
        departmentId: departmentIdRaw,
      },
    });
    return NextResponse.json({ success: true, technique: created });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'This slug already exists for this category in your workspace.' },
        { status: 400 }
      );
    }
    console.error('POST /api/provisor-private-company/techniques:', e);
    return NextResponse.json({ success: false, message: 'Failed to create technique' }, { status: 500 });
  }
}
