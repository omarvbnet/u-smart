import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function adminUnauthorized() {
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  try {
    const rows = await prisma.provisorTechnique.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return NextResponse.json({ success: true, techniques: rows });
  } catch (e) {
    console.error('GET /api/admin/provisor-techniques:', e);
    return NextResponse.json({ success: false, message: 'Failed to load techniques' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return adminUnauthorized();

  try {
    const body = await req.json();
    const category =
      body.category === 'MAINTENANCE' || body.category === 'INSPECTION_QC' ? body.category : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/\s+/g, '_') : '';
    const labelAr = typeof body.labelAr === 'string' ? body.labelAr.trim() : '';
    const labelEn = typeof body.labelEn === 'string' ? body.labelEn.trim() : undefined;
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;
    const active = body.active !== false;

    if (!category || !slug || !labelAr) {
      return NextResponse.json(
        { success: false, message: 'category, slug, and labelAr are required' },
        { status: 400 }
      );
    }

    const created = await prisma.provisorTechnique.create({
      data: {
        category,
        slug,
        labelAr,
        labelEn: labelEn || null,
        sortOrder,
        active,
      },
    });
    return NextResponse.json({ success: true, technique: created });
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code: string }).code : '';
    if (code === 'P2002') {
      return NextResponse.json({ success: false, message: 'This slug already exists for this category' }, { status: 400 });
    }
    console.error('POST /api/admin/provisor-techniques:', e);
    return NextResponse.json({ success: false, message: 'Failed to create technique' }, { status: 500 });
  }
}
