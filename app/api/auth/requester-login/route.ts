import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createRequesterToken, getRequesterCookieOptions, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { registerRequesterPushToken } from '@/lib/push-notifications';

export async function POST(req: NextRequest) {
  try {
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

    // Primary auth source: Coordinator users (new provider identity model).
    const coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
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

    if (coordinatorUser) {
      const valid = await bcrypt.compare(password, coordinatorUser.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { success: false, message: invalidMsg },
          { status: 401 }
        );
      }
      if (coordinatorUser.status === 'BLOCKED' || coordinatorUser.status === 'SUSPENDED') {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }

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

      const token = createRequesterToken({
        requesterId: coordinatorUser.id,
        username: coordinatorUser.username,
        name: coordinatorUser.name,
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
          username: coordinatorUser.username,
          name: coordinatorUser.name,
          email: coordinatorUser.email,
          role: coordinatorUser.role ?? 'COORDINATOR',
          companyId: coordinatorUser.companyId ?? null,
          mustChangePassword: coordinatorUser.mustChangePassword === true,
          status: coordinatorUser.status ?? 'ACTIVE',
          province: null,
          provinceFilterActive: true,
        },
      });

      res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
      return res;
    }

    // Backward-compatible auth source: legacy ticket requesters.
    const requester = await prisma.ticketRequester.findFirst({
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
        passwordHash: true,
        role: true,
        province: true,
        provinceFilterActive: true,
      },
    });

    if (!requester) {
      return NextResponse.json(
        { success: false, message: invalidMsg },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, requester.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: invalidMsg },
        { status: 401 }
      );
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
    const token = createRequesterToken({
      requesterId: requester.id,
      username: requester.username,
      name: requester.name,
      role,
      identitySource: 'ticket_requester',
      companyId: null,
      mustChangePassword: false,
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
        mustChangePassword: false,
        province,
        provinceFilterActive,
      },
    });

    res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
    return res;
  } catch (error) {
    console.error('Requester login error:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
