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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const { id } = await ctx.params;
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }
  const data: any = {};
  if (typeof body?.label === 'string') {
    const label = body.label.trim();
    if (!label) {
      return NextResponse.json({ success: false, message: 'Label cannot be empty.' }, { status: 400 });
    }
    data.label = label.slice(0, 160);
  }
  if ('description' in (body ?? {})) {
    const d = body.description == null ? null : String(body.description).trim();
    data.description = !d ? null : d.slice(0, 240);
  }
  if (Number.isFinite(Number(body?.sortOrder))) data.sortOrder = Number(body.sortOrder);
  if (typeof body?.active === 'boolean') data.active = body.active;
  if (typeof body?.audience === 'string') {
    const a = body.audience.toUpperCase();
    if (a === 'INDIVIDUAL' || a === 'COMPANY' || a === 'BOTH') data.audience = a;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'Nothing to update' }, { status: 400 });
  }
  try {
    const reason = await prisma.platformReason.update({ where: { id }, data });
    return NextResponse.json({ success: true, reason });
  } catch (err) {
    console.error('PATCH /api/admin/platform-reasons/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update reason' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const { id } = await ctx.params;
  try {
    await prisma.platformReason.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/platform-reasons/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete reason' }, { status: 500 });
  }
}
