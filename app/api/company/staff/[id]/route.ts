import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';
import {
  COMPANY_STAFF_CREATE_ROLES,
  decodeProfileSkills,
  encodeProfileSkills,
  hasPrivilege,
  normalizeCoordinatorRole,
  normalizeDepartments,
  normalizePrivileges,
} from '@/lib/coordinator-access';

const STAFF_MANAGER_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'MANAGER', 'COMPANY']);

async function resolveCompanyContext(req: NextRequest): Promise<{ companyId: string } | null> {
  const auth = getRequesterFromRequest(req);
  if (!auth) return null;
  if (auth.payload.identitySource === 'coordinator_user') {
    const me = await (prisma as any).coordinatorUser.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        role: true,
        companyId: true,
        profile: {
          select: { skills: true },
        },
      },
    });
    const access = decodeProfileSkills(me?.profile?.skills ?? [], me?.role ?? 'COORDINATOR');
    const canManage = me && (STAFF_MANAGER_ROLES.has(String(me.role)) || hasPrivilege(access.privileges, 'MANAGE_STAFF'));
    if (!me || !me.companyId || !canManage) return null;
    return { companyId: me.companyId };
  }
  if (auth.payload.identitySource === 'ticket_requester') {
    const requester = await (prisma as any).ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, username: true, email: true, role: true },
    });
    if (!requester || String(requester.role ?? '').toUpperCase() !== 'COMPANY') return null;
    const companyId = await getLinkedCoordinatorCompanyId(prisma, {
      id: requester.id,
      username: requester.username,
      email: requester.email ?? null,
      role: requester.role ?? null,
    });
    if (!companyId) return null;
    return { companyId };
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await resolveCompanyContext(req);
  if (!context) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing staff id.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const role = typeof body.role === 'string' ? normalizeCoordinatorRole(body.role) : '';
  const departments = normalizeDepartments(body.departments);
  const privileges = normalizePrivileges(body.privileges);
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';

  const existing = await (prisma as any).coordinatorUser.findFirst({
    where: { id, companyId: context.companyId },
    select: { id: true, role: true, profile: { select: { skills: true } } },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Staff member not found.' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (role) {
    if (!COMPANY_STAFF_CREATE_ROLES.has(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role.' }, { status: 400 });
    }
    updates.role = role;
  }
  if (status) {
    if (!['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status.' }, { status: 400 });
    }
    updates.status = status;
  }

  const user = await (prisma as any).coordinatorUser.update({
    where: { id },
    data: updates,
    select: { id: true, username: true, email: true, name: true, role: true, status: true },
  });

  if (departments.length > 0 || privileges.length > 0) {
    const currentSkills = (existing.profile?.skills ?? []) as string[];
    await (prisma as any).coordinatorProfile.upsert({
      where: { userId: id },
      update: {
        skills: encodeProfileSkills({ departments, privileges }, currentSkills),
      },
      create: {
        userId: id,
        skills: encodeProfileSkills({ departments, privileges }),
      },
    });
  }
  const profile = await (prisma as any).coordinatorProfile.findUnique({
    where: { userId: id },
    select: { skills: true },
  });
  const access = decodeProfileSkills(profile?.skills ?? [], user.role ?? 'COORDINATOR');

  return NextResponse.json({
    success: true,
    user: {
      ...user,
      departments: access.departments,
      privileges: access.privileges,
    },
  });
}
