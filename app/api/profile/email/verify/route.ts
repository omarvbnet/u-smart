import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { isValidEmailFormat, normalizeEmailInput } from '@/lib/email-input';

/**
 * POST /api/profile/email/verify
 *
 * Verifies the 6-digit code for the email the signed-in requester is adding,
 * then persists it as their auth/identity `email`. Re-checks uniqueness right
 * before writing to guard against races. Enables the company-upgrade request.
 */
export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator accounts are managed by your company owner.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email =
      typeof body?.email === 'string' ? normalizeEmailInput(body.email).toLowerCase() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!email || !isValidEmailFormat(email)) {
      return NextResponse.json(
        { success: false, message: 'A valid email address is required' },
        { status: 400 }
      );
    }
    if (!code) {
      return NextResponse.json(
        { success: false, message: 'Verification code is required' },
        { status: 400 }
      );
    }

    const ok = checkEmailOtp(email, code);
    if (!ok) {
      return NextResponse.json(
        { success: false, code: 'INVALID_CODE', message: 'Invalid or expired verification code.' },
        { status: 400 }
      );
    }

    // Guard against another account claiming the email between send and verify.
    const taken = await prisma.ticketRequester.findFirst({
      where: { email, NOT: { id: auth.payload.requesterId } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { success: false, code: 'EMAIL_TAKEN', message: 'This email is already in use by another account.' },
        { status: 409 }
      );
    }

    try {
      await prisma.ticketRequester.update({
        where: { id: auth.payload.requesterId },
        data: { email },
      });
    } catch (e) {
      // Unique constraint violation fallback.
      const err = e as { code?: string };
      if (err?.code === 'P2002') {
        return NextResponse.json(
          { success: false, code: 'EMAIL_TAKEN', message: 'This email is already in use by another account.' },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true, email, message: 'Email verified and saved.' });
  } catch (e) {
    console.error('POST /api/profile/email/verify:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to verify email' },
      { status: 500 }
    );
  }
}
