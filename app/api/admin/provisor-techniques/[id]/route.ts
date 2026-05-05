import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function isMissingProvisorTechniquesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (!('code' in error) || (error as { code?: string }).code !== 'P2021') return false;
  const meta = (error as { meta?: { table?: string } }).meta;
  const table = typeof meta?.table === 'string' ? meta.table : '';
  return table.includes('provisor_techniques');
}

function adminUnauthorized() {
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.slug === 'string') data.slug = body.slug.trim().toLowerCase().replace(/\s+/g, '_');
    if (typeof body.labelAr === 'string') data.labelAr = body.labelAr.trim();
    if (typeof body.labelEn === 'string') data.labelEn = body.labelEn.trim();
    if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;
    if (typeof body.active === 'boolean') data.active = body.active;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.provisorTechnique.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, technique: updated });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Slug conflict' }, { status: 400 });
    }
    if (isMissingProvisorTechniquesTable(e)) {
      return NextResponse.json(
        { success: false, message: 'Techniques table is missing. Run Prisma migrations first.' },
        { status: 503 }
      );
    }
    console.error('PATCH /api/admin/provisor-techniques/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = _req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
  }

  try {
    await prisma.provisorTechnique.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2025') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (isMissingProvisorTechniquesTable(e)) {
      return NextResponse.json(
        { success: false, message: 'Techniques table is missing. Run Prisma migrations first.' },
        { status: 503 }
      );
    }
    console.error('DELETE /api/admin/provisor-techniques/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete' }, { status: 500 });
  }
}
