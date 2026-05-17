import { NextRequest, NextResponse } from 'next/server';
import { RequesterRole } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES: RequesterRole[] = [
  'COMPANY',
  'PERSONAL',
  'ENGINEER',
  'TECHNICIAN',
  'WORKER',
  'MANAGER',
  'COORDINATOR',
  'WAREHOUSE_KEEPER',
];

const FIELD_ROLES = new Set<RequesterRole>(['ENGINEER', 'TECHNICIAN', 'WORKER']);

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
    return NextResponse.json({ success: false, message: 'Missing requester id' }, { status: 400 });
  }

  const body = await req.json();
  const statusRaw = typeof body.status === 'string' ? body.status.toUpperCase() : '';
  const roleRaw = typeof body.role === 'string' ? body.role.toUpperCase() : '';

  const data: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
    role?: RequesterRole;
    serviceSlug?: string;
  } = {};

  if (statusRaw) {
    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(statusRaw)) {
      return NextResponse.json(
        { success: false, message: 'Invalid status. Use ACTIVE, SUSPENDED, or BLOCKED' },
        { status: 400 }
      );
    }
    data.status = statusRaw as 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  }

  if (roleRaw) {
    if (!ALLOWED_ROLES.includes(roleRaw as RequesterRole)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid role. Use COMPANY, PERSONAL, ENGINEER, TECHNICIAN, WORKER, MANAGER, COORDINATOR, or WAREHOUSE_KEEPER',
        },
        { status: 400 }
      );
    }
    const ownedWorkspace = await prisma.privateCompany.findFirst({
      where: { ownerRequesterId: id },
      select: { id: true },
    });
    if (ownedWorkspace && roleRaw !== 'COMPANY' && roleRaw !== 'PERSONAL') {
      return NextResponse.json(
        {
          success: false,
          message: 'This user owns a private workspace. Change role to COMPANY or transfer ownership first.',
        },
        { status: 400 }
      );
    }
    data.role = roleRaw as RequesterRole;
    if (FIELD_ROLES.has(data.role)) {
      data.serviceSlug = 'quality-control-supervision';
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'Provide status and/or role to update' }, { status: 400 });
  }

  try {
    const updated = await prisma.ticketRequester.update({
      where: { id },
      data,
      select: { id: true, status: true, role: true, serviceSlug: true },
    });
    return NextResponse.json({
      success: true,
      requester: {
        id: updated.id,
        status: updated.status,
        role: updated.role,
        serviceSlug: updated.serviceSlug,
      },
    });
  } catch (err) {
    console.error('PATCH /api/admin/requesters/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update requester' }, { status: 500 });
  }
}
