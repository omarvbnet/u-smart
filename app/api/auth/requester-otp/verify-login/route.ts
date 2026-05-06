import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeEmailInput, isValidEmailFormat } from '@/lib/email-input';
import { consumeEmailOtp } from '@/lib/consume-email-otp';
import { findLegacyCompanyOwnerCoordinator } from '@/lib/linked-coordinator-company';
import {
  nextResponseCoordinatorSession,
  nextResponseLegacyOwnerSession,
  nextResponseTicketRequesterSession,
} from '@/lib/provisor-otp-login-issue';

/** Email + OTP sign-in for ticket requesters and coordinator users (no password). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const emailRaw = typeof body.email === 'string' ? normalizeEmailInput(body.email).toLowerCase() : '';
    const code = body.code != null ? String(body.code).trim() : '';
    const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
    const phonePlatform =
      typeof body.phonePlatform === 'string' ? body.phonePlatform.trim().toLowerCase() : '';

    if (!emailRaw || !isValidEmailFormat(emailRaw) || !code) {
      return NextResponse.json(
        { success: false, message: 'Valid email and verification code are required' },
        { status: 400 }
      );
    }

    const validOtp = await consumeEmailOtp(emailRaw, code);
    if (!validOtp) {
      return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 401 });
    }

    const requester = await prisma.ticketRequester.findFirst({
      where: { email: { equals: emailRaw, mode: 'insensitive' } },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        province: true,
        provinceFilterActive: true,
        mustChangePassword: true,
        status: true,
      },
    });

    if (requester) {
      if (requester.status === 'BLOCKED' || requester.status === 'SUSPENDED') {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }

      const ownerCoord = await findLegacyCompanyOwnerCoordinator(prisma, {
        id: requester.id,
        username: requester.username,
        email: requester.email ?? null,
        role: requester.role ?? null,
      });
      if (ownerCoord) {
        if (ownerCoord.status === 'BLOCKED' || ownerCoord.status === 'SUSPENDED') {
          return NextResponse.json(
            { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
            { status: 403 }
          );
        }
        return nextResponseLegacyOwnerSession(ownerCoord, pushToken, phonePlatform);
      }

      return nextResponseTicketRequesterSession(
        {
          ...requester,
          role: requester.role ?? 'COMPANY',
        },
        pushToken,
        phonePlatform
      );
    }

    let coordinatorUser: {
      id: string;
      username: string | null;
      name: string | null;
      email: string | null;
      passwordHash: string;
      role: string | null;
      status: string | null;
      mustChangePassword: boolean | null;
      companyId: string | null;
    } | null = null;
    try {
      coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
        where: { email: { equals: emailRaw, mode: 'insensitive' } },
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
    } catch {
      coordinatorUser = null;
    }

    if (coordinatorUser) {
      if (coordinatorUser.status === 'BLOCKED' || coordinatorUser.status === 'SUSPENDED') {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }
      return nextResponseCoordinatorSession(coordinatorUser, pushToken, phonePlatform);
    }

    return NextResponse.json(
      {
        success: false,
        code: 'NO_ACCOUNT',
        message: 'No account for this email. Create one with the sign-up option.',
      },
      { status: 404 }
    );
  } catch (e) {
    console.error('POST /api/auth/requester-otp/verify-login:', e);
    return NextResponse.json({ success: false, message: 'Sign-in failed' }, { status: 500 });
  }
}
