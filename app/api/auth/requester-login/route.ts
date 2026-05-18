import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createRequesterToken, getRequesterCookieOptions, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { registerRequesterPushToken } from '@/lib/push-notifications';
import { tryCompanyOwnerCoordinatorInsteadOfLegacy } from '@/lib/linked-coordinator-company';
import { decodeProfileSkills } from '@/lib/coordinator-access';
import {
  purgeExpiredAccountDeletions,
  resolveDeletionOnLogin,
} from '@/lib/ticket-requester-account-deletion';

export async function POST(req: NextRequest) {
  try {
    await purgeExpiredAccountDeletions().catch((e) =>
      console.error('purgeExpiredAccountDeletions on login:', e)
    );

    const body = await req.json();
    const usernameOrEmail =
      (typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail.trim() : '') ||
      (typeof body.username === 'string' ? body.username.trim() : '');
    const password = typeof body.password === 'string' ? body.password : '';
    const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
    const phonePlatform = typeof body.phonePlatform === 'string' ? body.phonePlatform.trim().toLowerCase() : '';

    if (!usernameOrEmail || !password) {
      return NextResponse.json(
        { success: false, message: 'Username/email and password required' },
        { status: 400 }
      );
    }

    const invalidMsg = 'Invalid username, email, or password';

    // Prefer legacy ticket requester when credentials match (stable for seeded
    // accounts that also have a coordinator row with a different password).
    const legacyUsernameHint =
      !usernameOrEmail.includes('@') && !usernameOrEmail.toLowerCase().endsWith('_legacy')
        ? `${usernameOrEmail}_legacy`
        : null;
    const requesterWhereOr: Array<{
      username?: { equals: string; mode: 'insensitive' };
      email?: { equals: string; mode: 'insensitive' };
    }> = [
      { username: { equals: usernameOrEmail, mode: 'insensitive' } },
      { email: { equals: usernameOrEmail, mode: 'insensitive' } },
    ];
    if (legacyUsernameHint) {
      requesterWhereOr.push({ username: { equals: legacyUsernameHint, mode: 'insensitive' } });
    }
    const requester = await prisma.ticketRequester.findFirst({
      where: { OR: requesterWhereOr },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        province: true,
        provinceFilterActive: true,
        mustChangePassword: true,
      },
    });

    if (requester && (await bcrypt.compare(password, requester.passwordHash))) {
      const deletion = await resolveDeletionOnLogin(requester.id);
      if (deletion === 'deleted') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Your account was deleted after the scheduled deletion period. Contact support if this is a mistake.',
          },
          { status: 410 }
        );
      }

      const ownerCoord = await tryCompanyOwnerCoordinatorInsteadOfLegacy(prisma, {
        id: requester.id,
        username: requester.username,
        email: (requester as { email?: string | null }).email ?? null,
        role: (requester as { role?: string }).role ?? null,
      }, password);
      if (ownerCoord) {
        if (ownerCoord.status === 'BLOCKED' || ownerCoord.status === 'SUSPENDED') {
          return NextResponse.json(
            { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
            { status: 403 }
          );
        }
        if (pushToken) {
          try {
            await registerRequesterPushToken(
              prisma as any,
              ownerCoord.id,
              pushToken,
              (phonePlatform as any) || 'unknown'
            );
          } catch (e) {
            console.error('Failed to save coordinator push token on login:', e);
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

      if (pushToken) {
        try {
          await registerRequesterPushToken(
            prisma as any,
            requester.id,
            pushToken,
            (phonePlatform as any) || 'unknown'
          );
        } catch (e) {
          console.error('Failed to save requester push token on login:', e);
        }
      }

      const role = (requester as { role?: string }).role ?? 'COMPANY';
      const province = (requester as { province?: string | null }).province ?? null;
      const provinceFilterActive = (requester as { provinceFilterActive?: boolean }).provinceFilterActive ?? true;
      const mustFlag = (requester as { mustChangePassword?: boolean }).mustChangePassword === true;
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

    let coordinatorUser: {
      id: string;
      username?: string | null;
      name?: string | null;
      email?: string | null;
      passwordHash: string;
      role?: string | null;
      status?: string | null;
      mustChangePassword?: boolean | null;
      companyId?: string | null;
    } | null = null;
    try {
      coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
        where: {
          OR: [
            { username: { equals: usernameOrEmail, mode: 'insensitive' } },
            { email: { equals: usernameOrEmail, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          passwordHash: true,
          role: true,
          status: true,
          mustChangePassword: true,
          companyId: true,
        },
      });
    } catch (coordinatorQueryErr) {
      try {
        coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
          where: { email: { equals: usernameOrEmail, mode: 'insensitive' } },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            companyId: true,
          },
        });
      } catch {
        coordinatorUser = null;
      }
      if (process.env.NODE_ENV === 'development') {
        console.warn('Coordinator lookup fallback triggered:', coordinatorQueryErr);
      }
    }

    if (coordinatorUser) {
      const valid = await bcrypt.compare(password, coordinatorUser.passwordHash);
      if (valid && (coordinatorUser.status === 'BLOCKED' || coordinatorUser.status === 'SUSPENDED')) {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }

      if (valid) {
        if (pushToken) {
          try {
            await registerRequesterPushToken(
              prisma as any,
              coordinatorUser.id,
              pushToken,
              (phonePlatform as any) || 'unknown'
            );
          } catch (e) {
            console.error('Failed to save coordinator push token on login:', e);
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
    }

    return NextResponse.json(
      { success: false, message: invalidMsg },
      { status: 401 }
    );
  } catch (error) {
    console.error('Requester login error:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed' },
      { status: 500 }
    );
  }
}
