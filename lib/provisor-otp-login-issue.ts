import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRequesterToken, REQUESTER_COOKIE_NAME, getRequesterCookieOptions } from '@/lib/requester-auth';
import { registerRequesterPushToken } from '@/lib/push-notifications';
import { decodeProfileSkills } from '@/lib/coordinator-access';
import type { CoordinatorLoginRow } from '@/lib/linked-coordinator-company';

type TicketRequesterRow = {
  id: string;
  username: string;
  name: string | null;
  email?: string | null;
  role?: string;
  province?: string | null;
  provinceFilterActive?: boolean;
  mustChangePassword?: boolean;
  status?: string;
};

/** Session for a normal ticket_requester JWT (Provisor legacy / direct-registered). */
export async function nextResponseTicketRequesterSession(
  requester: TicketRequesterRow,
  pushToken: string,
  phonePlatform: string
): Promise<NextResponse> {
  if (pushToken) {
    try {
      await registerRequesterPushToken(prisma as any, requester.id, pushToken, (phonePlatform as any) || 'unknown');
    } catch (e) {
      console.error('Failed to save requester push token on OTP login:', e);
    }
  }

  const role = (requester.role ?? 'COMPANY').toString();
  const province = requester.province ?? null;
  const provinceFilterActive = requester.provinceFilterActive ?? true;
  const mustFlag = requester.mustChangePassword === true;
  const token = createRequesterToken({
    requesterId: requester.id,
    username: requester.username,
    name: requester.name,
    role,
    identitySource: 'ticket_requester',
    companyId: null,
    mustChangePassword: mustFlag,
  });

  const res = NextResponse.json({
    success: true,
    token,
    user: {
      id: requester.id,
      username: requester.username,
      name: requester.name,
      email: requester.email ?? null,
      role,
      companyId: null,
      mustChangePassword: mustFlag,
      province,
      provinceFilterActive,
    },
  });
  res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
  return res;
}

/** Coordinator platform user (TECHNICIAN, ENGINEER, COMPANY_OWNER, …). */
export async function nextResponseCoordinatorSession(
  coordinatorUser: CoordinatorLoginRow & { status?: string | null },
  pushToken: string,
  phonePlatform: string
): Promise<NextResponse> {
  if (pushToken) {
    try {
      await registerRequesterPushToken(
        prisma as any,
        coordinatorUser.id,
        pushToken,
        (phonePlatform as any) || 'unknown'
      );
    } catch (e) {
      console.error('Failed to save coordinator push token on OTP login:', e);
    }
  }

  const username =
    (typeof coordinatorUser.username === 'string' && coordinatorUser.username.trim()) ||
    (typeof coordinatorUser.email === 'string' ? coordinatorUser.email.split('@')[0] : '') ||
    `coord_${coordinatorUser.id.slice(-6)}`;
  const coordinatorProfile = await (prisma as any).coordinatorProfile.findUnique({
    where: { userId: coordinatorUser.id },
    select: { skills: true },
  });
  const coordinatorAccess = decodeProfileSkills(
    coordinatorProfile?.skills ?? [],
    coordinatorUser.role ?? 'COORDINATOR'
  );
  const token = createRequesterToken({
    requesterId: coordinatorUser.id,
    username,
    name: coordinatorUser.name ?? null,
    role: coordinatorUser.role ?? 'COORDINATOR',
    companyId: coordinatorUser.companyId ?? null,
    mustChangePassword: coordinatorUser.mustChangePassword === true,
    identitySource: 'coordinator_user',
  });

  const res = NextResponse.json({
    success: true,
    token,
    user: {
      id: coordinatorUser.id,
      username,
      name: coordinatorUser.name ?? null,
      email: coordinatorUser.email ?? null,
      role: coordinatorUser.role ?? 'COORDINATOR',
      companyId: coordinatorUser.companyId ?? null,
      mustChangePassword: coordinatorUser.mustChangePassword === true,
      status: coordinatorUser.status ?? 'ACTIVE',
      province: null,
      provinceFilterActive: true,
      departments: coordinatorAccess.departments,
      privileges: coordinatorAccess.privileges,
    },
  });
  res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
  return res;
}

/** Legacy COMPANY requester that maps to coordinator COMPANY_OWNER (same as password login success path). */
export async function nextResponseLegacyOwnerSession(
  ownerCoord: CoordinatorLoginRow,
  pushToken: string,
  phonePlatform: string
): Promise<NextResponse> {
  if (pushToken) {
    try {
      await registerRequesterPushToken(
        prisma as any,
        ownerCoord.id,
        pushToken,
        (phonePlatform as any) || 'unknown'
      );
    } catch (e) {
      console.error('Failed to save coordinator push token on OTP login:', e);
    }
  }
  const username =
    (typeof ownerCoord.username === 'string' && ownerCoord.username.trim()) ||
    (typeof ownerCoord.email === 'string' ? ownerCoord.email.split('@')[0] : '') ||
    `coord_${ownerCoord.id.slice(-6)}`;
  const ownerProfile = await (prisma as any).coordinatorProfile.findUnique({
    where: { userId: ownerCoord.id },
    select: { skills: true },
  });
  const ownerAccess = decodeProfileSkills(ownerProfile?.skills ?? [], ownerCoord.role ?? 'COMPANY_OWNER');
  const token = createRequesterToken({
    requesterId: ownerCoord.id,
    username,
    name: ownerCoord.name ?? null,
    role: ownerCoord.role ?? 'COMPANY_OWNER',
    companyId: ownerCoord.companyId ?? null,
    mustChangePassword: ownerCoord.mustChangePassword === true,
    identitySource: 'coordinator_user',
  });
  const res = NextResponse.json({
    success: true,
    token,
    user: {
      id: ownerCoord.id,
      username,
      name: ownerCoord.name ?? null,
      email: ownerCoord.email ?? null,
      role: ownerCoord.role ?? 'COMPANY_OWNER',
      companyId: ownerCoord.companyId ?? null,
      mustChangePassword: ownerCoord.mustChangePassword === true,
      status: ownerCoord.status ?? 'ACTIVE',
      province: null,
      provinceFilterActive: true,
      departments: ownerAccess.departments,
      privileges: ownerAccess.privileges,
    },
  });
  res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
  return res;
}
