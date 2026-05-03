import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { normalizeEmailInput } from '@/lib/email-input';

/** Admin reset password: verify OTP and set new password. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? normalizeEmailInput(body.email).toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Email, verification code, and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    let valid = checkEmailOtp(email, code);
    if (!valid) {
      try {
        const db = prisma as unknown as {
          emailOtp?: {
            findFirst: (args: { where: { email: string }; orderBy: { expiresAt: 'desc' } }) => Promise<{ code: string; expiresAt: Date } | null>;
            deleteMany: (args: { where: { email: string } }) => Promise<unknown>;
          };
        };
        if (db.emailOtp?.findFirst) {
          const record = await db.emailOtp.findFirst({
            where: { email },
            orderBy: { expiresAt: 'desc' },
          });
          if (record && new Date() <= record.expiresAt) {
            const digits = String(code).replace(/\D/g, '');
            const codeStr = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
            const storedDigits = String(record.code).replace(/\D/g, '');
            const storedCode = storedDigits.length >= 6 ? storedDigits.slice(-6) : storedDigits.padStart(6, '0');
            if (codeStr === storedCode) {
              valid = true;
              if (db.emailOtp?.deleteMany) {
                await db.emailOtp.deleteMany({ where: { email } });
              }
            }
          }
        }
      } catch (_) {}
    }

    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification code' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Account not found' },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. You can now sign in.',
    });
  } catch (e) {
    console.error('POST /api/auth/reset-password:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
