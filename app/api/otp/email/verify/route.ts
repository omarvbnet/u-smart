import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setEmailVerifiedCookie } from '@/lib/otp-auth';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { normalizeEmailInput } from '@/lib/email-input';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? normalizeEmailInput(body.email).toLowerCase() : '';
    const codeRaw = body.code != null ? String(body.code).trim() : '';
    const digits = codeRaw.replace(/\D/g, '');
    const code = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
    if (!email || !codeRaw) {
      return NextResponse.json(
        { success: false, message: 'Email and code are required' },
        { status: 400 }
      );
    }

    const db = prisma as unknown as {
      emailOtp?: {
        findFirst: (args: {
          where: { email: string; code: string; expiresAt: { gt: Date } };
          orderBy: { createdAt: 'desc' };
        }) => Promise<{ id: string } | null>;
        deleteMany: (args: { where: { email: string } }) => Promise<unknown>;
      };
    };

    let valid = checkEmailOtp(email, code);
    if (!valid && db.emailOtp?.findFirst) {
      const record = await db.emailOtp.findFirst({
        where: {
          email,
          code,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      valid = !!record;
      if (valid && db.emailOtp?.deleteMany) {
        await db.emailOtp.deleteMany({ where: { email } });
      }
    }

    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired code' },
        { status: 400 }
      );
    }

    await setEmailVerifiedCookie(email);

    return NextResponse.json({
      success: true,
      message: 'Email verified',
    });
  } catch (e) {
    console.error('POST /api/otp/email/verify:', e);
    return NextResponse.json(
      { success: false, message: 'Verification failed' },
      { status: 500 }
    );
  }
}
