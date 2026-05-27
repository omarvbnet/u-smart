import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return false;
  return true;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  try {
    const types = await prisma.issueReportType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return NextResponse.json({ success: true, types });
  } catch (err) {
    console.error('GET /api/admin/issue-report-types:', err);
    return NextResponse.json({ success: false, message: 'Failed to load types' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }
  const label = String(body?.label ?? '').trim();
  const description = body?.description ? String(body.description).trim().slice(0, 240) : null;
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;
  const active = body?.active === false ? false : true;
  let slug = body?.slug ? slugify(String(body.slug)) : slugify(label);
  if (!label) {
    return NextResponse.json({ success: false, message: 'Label is required.' }, { status: 400 });
  }
  if (!slug) {
    slug = `type_${Date.now().toString(36)}`;
  }
  try {
    const type = await prisma.issueReportType.create({
      data: { slug, label, description, sortOrder, active },
    });
    return NextResponse.json({ success: true, type });
  } catch (err: any) {
    if (String(err?.message || '').includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, message: 'A type with that slug already exists.' },
        { status: 409 }
      );
    }
    console.error('POST /api/admin/issue-report-types:', err);
    return NextResponse.json({ success: false, message: 'Failed to create type' }, { status: 500 });
  }
}
