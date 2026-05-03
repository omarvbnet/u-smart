import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setEmailOtp } from '@/lib/email-otp-store';
import { sendForgotPasswordOtp } from '@/lib/email';
import { normalizeEmailInput } from '@/lib/email-input';

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

/** Requester (Provisor) forgot password: send OTP to email. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameOrEmailRaw = typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail : '';
    const usernameOrEmail = usernameOrEmailRaw.trim();
    if (!usernameOrEmail) {
      return NextResponse.json(
        { success: false, message: 'Username or email is required' },
        { status: 400 }
      );
    }

    const isEmail = usernameOrEmail.includes('@');
    const emailLookup = isEmail ? normalizeEmailInput(usernameOrEmail).toLowerCase() : '';
    const coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
      where: isEmail
        ? { email: emailLookup }
        : { username: { equals: usernameOrEmail, mode: 'insensitive' } },
      select: { email: true },
    });

    const requester = coordinatorUser ?? await prisma.ticketRequester.findFirst({
      where: isEmail
        ? { email: emailLookup }
        : { username: usernameOrEmail },
    });

    if (!requester) {
      return NextResponse.json(
        { success: true, message: 'If an account exists, you will receive a verification code.' },
      );
    }

    const email = (requester as { email?: string | null }).email;
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'No email on file for this account. Contact support.' },
        { status: 400 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const emailNorm = email.toLowerCase();

    try {
      const db = prisma as unknown as { emailOtp?: { create: (args: { data: { email: string; code: string; expiresAt: Date } }) => Promise<unknown> } };
      if (db.emailOtp?.create) {
        await db.emailOtp.create({
          data: { email: emailNorm, code, expiresAt },
        });
      }
    } catch (dbErr) {
      console.error('Email OTP save:', dbErr);
    }

    setEmailOtp(emailNorm, code);
    const sent = await sendForgotPasswordOtp(emailNorm, code);
    const isDev = process.env.NODE_ENV !== 'production';

    if (!sent && !isDev) {
      return NextResponse.json(
        { success: false, message: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists, you will receive a verification code.',
      emailHint: emailNorm.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '***' + c),
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/auth/requester-forgot-password:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send verification code' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
