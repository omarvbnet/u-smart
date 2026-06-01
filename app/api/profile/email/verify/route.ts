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
    const codeRaw = body?.code != null ? String(body.code).trim() : '';
    const digits = codeRaw.replace(/\D/g, '');
    const code = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
    if (!email || !isValidEmailFormat(email)) {
      return NextResponse.json(
        { success: false, message: 'A valid email address is required' },
        { status: 400 }
      );
    }
    if (!codeRaw) {
      return NextResponse.json(
        { success: false, message: 'Verification code is required' },
        { status: 400 }
      );
    }

    // In-memory store only works within a single serverless instance, so fall
    // back to the persisted EmailOtp table (the send route writes to both).
    let valid = checkEmailOtp(email, code);
    if (!valid) {
      const db = prisma as unknown as {
        emailOtp?: {
          findFirst: (args: {
            where: { email: string; code: string; expiresAt: { gt: Date } };
            orderBy: { createdAt: 'desc' };
          }) => Promise<{ id: string } | null>;
          deleteMany: (args: { where: { email: string } }) => Promise<unknown>;
        };
      };
      if (db.emailOtp?.findFirst) {
        const record = await db.emailOtp.findFirst({
          where: { email, code, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        valid = !!record;
        if (valid && db.emailOtp?.deleteMany) {
          await db.emailOtp.deleteMany({ where: { email } });
        }
      }
    }

    if (!valid) {
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
