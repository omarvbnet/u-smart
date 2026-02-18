import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const contacts = await prisma.coordinatorContact.findMany({
      where: { companyId: payload.companyId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, contacts });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/contacts:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch contacts' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    let phone = typeof body.phone === 'string' ? body.phone.trim().replace(/\s/g, '') : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: 'Phone is required (E.164, e.g. +9647712345678)' }, { status: 400 });
    }
    if (!phone.startsWith('+')) phone = `+${phone}`;
    if (!/^\+[0-9]{10,15}$/.test(phone)) {
      return NextResponse.json({ success: false, message: 'Phone must be E.164 (e.g. +9647712345678)' }, { status: 400 });
    }

    const contact = await prisma.coordinatorContact.create({
      data: {
        name,
        phone,
        notes,
        companyId: payload.companyId,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'contact_create',
      resource: 'contact',
      resourceId: contact.id,
      payload: { name: contact.name },
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, contact });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/contacts:', e);
    return NextResponse.json({ success: false, message: 'Failed to create contact' }, { status: 500 });
  }
}
