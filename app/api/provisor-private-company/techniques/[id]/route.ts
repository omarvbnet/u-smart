import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function requireWorkspaceOwnerForTechniques(req: NextRequest): Promise<
  | { ok: true; companyId: string }
  | { ok: false; response: NextResponse }
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
  return { ok: true, companyId: m.effectiveCompanyId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireWorkspaceOwnerForTechniques(req);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
  }

  try {
    const existing = await prisma.privateCompanyTechnique.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.slug === 'string') data.slug = body.slug.trim().toLowerCase().replace(/\s+/g, '_');
    if (typeof body.labelAr === 'string') data.labelAr = body.labelAr.trim();
    if (typeof body.labelEn === 'string') data.labelEn = body.labelEn.trim();
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;
    if (typeof body.active === 'boolean') data.active = body.active;
    if (body.departmentId === null || body.departmentId === '') {
      data.departmentId = null;
    } else if (typeof body.departmentId === 'string' && body.departmentId.trim()) {
      const dept = await prisma.privateCompanyDepartment.findFirst({
        where: { id: body.departmentId.trim(), companyId: ctx.companyId },
        select: { id: true },
      });
      if (!dept) {
        return NextResponse.json(
          { success: false, message: 'Department not found in this workspace.' },
          { status: 400 }
        );
      }
      data.departmentId = body.departmentId.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.privateCompanyTechnique.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, technique: updated });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Slug conflict' }, { status: 400 });
    }
    console.error('PATCH /api/provisor-private-company/techniques/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireWorkspaceOwnerForTechniques(_req);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
  }

  try {
    const existing = await prisma.privateCompanyTechnique.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    await prisma.privateCompanyTechnique.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/provisor-private-company/techniques/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete' }, { status: 500 });
  }
}
