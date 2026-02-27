import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

const prisma = _prisma as any;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing engineer id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.status === 'string') {
      const status = body.status.toUpperCase();
      if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
        return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
      }
      data.status = status;
    }

    if (typeof body.name === 'string') {
      data.name = body.name.trim() || null;
    }

    if (typeof body.phone === 'string') {
      data.phone = body.phone.trim();
    }

    if (typeof body.province === 'string') {
      data.province = body.province.trim() || null;
    }

    if (typeof body.provinceFilterActive === 'boolean') {
      data.provinceFilterActive = body.provinceFilterActive;
    }

    if (typeof body.password === 'string' && body.password.trim().length >= 6) {
      data.passwordHash = await bcrypt.hash(body.password.trim(), 10);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.ticketRequester.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        province: true,
        provinceFilterActive: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      engineer: {
        ...updated,
        province: updated.province ?? null,
        provinceFilterActive: updated.provinceFilterActive ?? true,
        status: updated.status ?? 'ACTIVE',
      },
    });
  } catch (err) {
    console.error('PATCH /api/admin/engineers/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update engineer' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.ticketRequester.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/engineers/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete engineer' }, { status: 500 });
  }
}
