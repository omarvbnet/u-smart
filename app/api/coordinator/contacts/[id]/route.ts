import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await prisma.coordinatorContact.findFirst({ where: { id, companyId: payload.companyId } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
    }

    const data: { name?: string; phone?: string; notes?: string | null } = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.phone === 'string') {
      let phone = body.phone.trim().replace(/\s/g, '');
      if (!phone.startsWith('+')) phone = `+${phone}`;
      if (/^\+[0-9]{10,15}$/.test(phone)) data.phone = phone;
    }
    if (body.notes !== undefined) data.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, contact: existing });
    }

    const contact = await prisma.coordinatorContact.update({
      where: { id },
      data,
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'contact_update',
      resource: 'contact',
      resourceId: id,
      payload: data,
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, contact });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/contacts/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update contact' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;

    const existing = await prisma.coordinatorContact.findFirst({ where: { id, companyId: payload.companyId } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
    }

    await prisma.coordinatorContact.delete({ where: { id } });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'contact_delete',
      resource: 'contact',
      resourceId: id,
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/contacts/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete contact' }, { status: 500 });
  }
}
