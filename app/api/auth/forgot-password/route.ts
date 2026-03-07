import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setEmailOtp } from '@/lib/email-otp-store';
import { sendForgotPasswordOtp } from '@/lib/email';

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

/** Admin forgot password: send OTP to email. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: true, message: 'If an account exists with this email, you will receive a verification code.' },
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    try {
      const db = prisma as unknown as { emailOtp?: { create: (args: { data: { email: string; code: string; expiresAt: Date } }) => Promise<unknown> } };
      if (db.emailOtp?.create) {
        await db.emailOtp.create({
          data: { email, code, expiresAt },
        });
      }
    } catch (dbErr) {
      console.error('Email OTP save:', dbErr);
    }

    setEmailOtp(email, code);
    const sent = await sendForgotPasswordOtp(email, code);
    const isDev = process.env.NODE_ENV !== 'production';

    if (!sent && !isDev) {
      return NextResponse.json(
        { success: false, message: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a verification code.',
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/auth/forgot-password:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send verification code' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
