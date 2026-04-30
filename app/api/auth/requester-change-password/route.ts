import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

/** Requester (Provisor) change password: verify OTP and set new password (logged in). */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const payload = auth.payload;

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { id: true, email: true, status: true },
    });

    if (!requester) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }

    const status = (requester as { status?: string }).status ?? 'ACTIVE';
    if (status === 'BLOCKED') {
      return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
    }

    const body = await req.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!code || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Verification code and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const email = (requester as { email?: string | null }).email;
    if (!email) {
      return NextResponse.json(
        { success: false, message: 'No email on file for this account.' },
        { status: 400 }
      );
    }

    const emailNorm = email.toLowerCase();
    let valid = checkEmailOtp(emailNorm, code);
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
            where: { email: emailNorm },
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
                await db.emailOtp.deleteMany({ where: { email: emailNorm } });
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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.ticketRequester.update({
      where: { id: requester.id },
      data: { passwordHash, hasUpdatedCredentials: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Password has been updated successfully.',
    });
  } catch (e) {
    console.error('POST /api/auth/requester-change-password:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to update password' },
      { status: 500 }
    );
  }
}
