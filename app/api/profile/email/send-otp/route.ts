import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { setEmailOtp } from '@/lib/email-otp-store';
import { sendOtpEmail } from '@/lib/email';
import { isValidEmailFormat, normalizeEmailInput } from '@/lib/email-input';

const OTP_EXPIRY_MINUTES = 10;
const CODE_LENGTH = 6;

function generateCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

/**
 * POST /api/profile/email/send-otp
 *
 * Sends a 6-digit verification code to an email the signed-in requester wants
 * to add to their profile (the auth/identity `email`, which unlocks the
 * PERSONAL -> COMPANY upgrade request). Rejects emails already used by another
 * account before sending.
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
    if (!email || !isValidEmailFormat(email)) {
      return NextResponse.json(
        { success: false, message: 'A valid email address is required' },
        { status: 400 }
      );
    }

    // Reject if the email already belongs to another account (email is @unique).
    const existing = await prisma.ticketRequester.findFirst({
      where: { email, NOT: { id: auth.payload.requesterId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, code: 'EMAIL_TAKEN', message: 'This email is already in use by another account.' },
        { status: 409 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    try {
      const db = prisma as unknown as {
        emailOtp?: { create: (args: { data: { email: string; code: string; expiresAt: Date } }) => Promise<unknown> };
      };
      if (db.emailOtp?.create) {
        await db.emailOtp.create({ data: { email, code, expiresAt } });
      }
    } catch (dbErr) {
      console.error('Profile email OTP save:', dbErr);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    setEmailOtp(email, code);

    const sent = await sendOtpEmail(email, code);
    if (!sent && !isDev) {
      return NextResponse.json(
        { success: false, message: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/profile/email/send-otp:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send verification code' },
      { status: 500 }
    );
  }
}
