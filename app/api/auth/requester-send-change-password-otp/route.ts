import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setEmailOtp } from '@/lib/email-otp-store';
import { sendForgotPasswordOtp } from '@/lib/email';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

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

/** Requester (Provisor) change password: send OTP to logged-in requester's email. */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const payload = auth.payload;

    if (payload.identitySource === 'coordinator_user') {
      const coordinatorUser = await (prisma as any).coordinatorUser.findUnique({
        where: { id: payload.requesterId },
        select: { email: true, status: true },
      });
      if (!coordinatorUser) {
        return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
      }
      if (coordinatorUser.status === 'BLOCKED') {
        return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
      }
      const email = coordinatorUser.email as string | null;
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
      } catch {
        /* ignore */
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
        message: 'Verification code sent to your email',
        emailHint: emailNorm.replace(/(.{2})(.*)(@.*)/, (_, a: string, b: string, c: string) => a + '***' + c),
        ...(isDev && { devCode: code }),
      });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { email: true, status: true },
    });

    if (!requester) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }

    const status = (requester as { status?: string }).status ?? 'ACTIVE';
    if (status === 'BLOCKED') {
      return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
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
      message: 'Verification code sent to your email',
      emailHint: emailNorm.replace(/(.{2})(.*)(@.*)/, (_, a: string, b: string, c: string) => a + '***' + c),
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/auth/requester-send-change-password-otp:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send verification code' },
      { status: 500 }
    );
  }
}
