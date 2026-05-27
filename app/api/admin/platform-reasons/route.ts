import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const KINDS = ['MAINTENANCE', 'EXPENSE'] as const;
const AUDIENCES = ['INDIVIDUAL', 'COMPANY', 'BOTH'] as const;

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) return false;
  return true;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const audience = sp.get('audience');
  const where: any = {};
  if (kind && (KINDS as readonly string[]).includes(kind)) where.kind = kind;
  if (audience && (AUDIENCES as readonly string[]).includes(audience)) where.audience = audience;
  try {
    const reasons = await prisma.platformReason.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { audience: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return NextResponse.json({ success: true, reasons });
  } catch (err) {
    console.error('GET /api/admin/platform-reasons:', err);
    return NextResponse.json({ success: false, message: 'Failed to load reasons' }, { status: 500 });
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
  const kind = String(body?.kind ?? '').toUpperCase();
  const audience = String(body?.audience ?? 'BOTH').toUpperCase();
  const label = String(body?.label ?? '').trim();
  if (!label) {
    return NextResponse.json({ success: false, message: 'Label is required.' }, { status: 400 });
  }
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ success: false, message: 'Invalid kind.' }, { status: 400 });
  }
  if (!(AUDIENCES as readonly string[]).includes(audience)) {
    return NextResponse.json({ success: false, message: 'Invalid audience.' }, { status: 400 });
  }
  const description = body?.description ? String(body.description).trim().slice(0, 240) : null;
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;
  const active = body?.active === false ? false : true;

  try {
    const reason = await prisma.platformReason.create({
      data: { kind, audience, label: label.slice(0, 160), description, sortOrder, active },
    });
    return NextResponse.json({ success: true, reason });
  } catch (err: any) {
    if (String(err?.message || '').includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, message: 'A reason with that label already exists for this audience.' },
        { status: 409 }
      );
    }
    console.error('POST /api/admin/platform-reasons:', err);
    return NextResponse.json({ success: false, message: 'Failed to create reason' }, { status: 500 });
  }
}
