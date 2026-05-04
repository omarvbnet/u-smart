import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_MANAGER_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN']);
const ALLOWED_STAFF_ROLES = new Set([
  'COMPANY_OWNER',
  'COORDINATOR',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
]);

async function resolveManagerCompany(req: NextRequest): Promise<{ managerId: string; companyId: string } | null> {
  const auth = getRequesterFromRequest(req);
  if (!auth) return null;

  if (auth.payload.identitySource === 'coordinator_user' && auth.payload.companyId) {
    const me = await db.coordinatorUser.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, companyId: true, status: true },
    });
    if (!me || !ALLOWED_MANAGER_ROLES.has(String(me.role)) || me.status !== 'ACTIVE') return null;
    return { managerId: auth.payload.requesterId as string, companyId: me.companyId as string };
  }

  if (auth.payload.identitySource === 'ticket_requester') {
    const tr = await db.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, username: true, email: true, status: true },
    });
    const role = String((tr as { role?: string })?.role ?? '').toUpperCase();
    const status = String((tr as { status?: string })?.status ?? 'ACTIVE').toUpperCase();
    if (role !== 'COMPANY' || status === 'BLOCKED' || status === 'SUSPENDED') return null;
    const companyId = await getLinkedCoordinatorCompanyId(db, {
      id: auth.payload.requesterId as string,
      username: (tr as { username?: string }).username ?? '',
      email: (tr as { email?: string | null }).email ?? null,
      role,
    });
    if (!companyId) return null;
    return { managerId: auth.payload.requesterId as string, companyId };
  }

  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolveManagerCompany(req);
  if (!ctx) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });

  const user = await db.coordinatorUser.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, username: true, name: true, email: true, role: true, status: true, mustChangePassword: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  return NextResponse.json({ success: true, user });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolveManagerCompany(req);
  if (!ctx) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });

  // Prevent self-modification of own status
  if (id === ctx.managerId) {
    return NextResponse.json({ success: false, message: 'Cannot modify your own account here.' }, { status: 400 });
  }

  const target = await db.coordinatorUser.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ success: false, message: 'User not found in your company.' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (typeof body.status === 'string') {
    const s = body.status.toUpperCase();
    if (s !== 'ACTIVE' && s !== 'INACTIVE') {
      return NextResponse.json({ success: false, message: 'Invalid status. Use ACTIVE or INACTIVE.' }, { status: 400 });
    }
    updateData.status = s;
  }

  if (typeof body.role === 'string') {
    const r = body.role.toUpperCase();
    if (!ALLOWED_STAFF_ROLES.has(r)) {
      return NextResponse.json({ success: false, message: 'Invalid role.' }, { status: 400 });
    }
    updateData.role = r;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ success: false, message: 'No valid fields to update.' }, { status: 400 });
  }

  const updated = await db.coordinatorUser.update({
    where: { id },
    data: updateData,
    select: { id: true, username: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json({ success: true, user: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolveManagerCompany(req);
  if (!ctx) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });

  if (id === ctx.managerId) {
    return NextResponse.json({ success: false, message: 'Cannot delete your own account.' }, { status: 400 });
  }

  const target = await db.coordinatorUser.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });

  await db.coordinatorUser.delete({ where: { id } });
  return NextResponse.json({ success: true, message: 'Staff member removed.' });
}
