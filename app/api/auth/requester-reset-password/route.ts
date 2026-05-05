import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { sendRecoveryCredentialsEmail } from '@/lib/email';
import { generateTemporaryPassword } from '@/lib/temporary-password';

/** Requester (Provisor) reset: verify OTP, then email username + temporary password (must change on login). Legacy: pass newPassword to set directly. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameOrEmail = typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';

    if (!usernameOrEmail || !code) {
      return NextResponse.json(
        { success: false, message: 'Username/email and verification code are required' },
        { status: 400 }
      );
    }

    if (newPassword && newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const isEmail = usernameOrEmail.includes('@');
    const coordinatorUser = await (prisma as any).coordinatorUser.findFirst({
      where: isEmail
        ? { email: usernameOrEmail.toLowerCase() }
        : { username: { equals: usernameOrEmail, mode: 'insensitive' } },
      select: { id: true, email: true, username: true },
    });
    const requester = coordinatorUser ?? await prisma.ticketRequester.findFirst({
      where: isEmail
        ? { email: usernameOrEmail.toLowerCase() }
        : { username: usernameOrEmail },
    });

    if (!requester) {
      return NextResponse.json(
        { success: false, message: 'Account not found' },
        { status: 404 }
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

    if (newPassword) {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      if (coordinatorUser !== null) {
        await (prisma as any).coordinatorUser.update({
          where: { id: requester.id },
          data: { passwordHash, mustChangePassword: false },
        });
      } else {
        await prisma.ticketRequester.update({
          where: { id: requester.id },
          data: { passwordHash, hasUpdatedCredentials: true, mustChangePassword: false },
        });
      }
      return NextResponse.json({
        success: true,
        message: 'Password has been reset. You can now sign in.',
      });
    }

    const plain = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(plain, 10);
    const isCoordinatorAccount = coordinatorUser !== null;
    if (isCoordinatorAccount) {
      const row = requester as { id: string; username?: string | null; email?: string | null };
      await (prisma as any).coordinatorUser.update({
        where: { id: row.id },
        data: { passwordHash, mustChangePassword: true },
      });
      const loginName =
        (typeof row.username === 'string' && row.username.trim()) ||
        (typeof row.email === 'string' && row.email.includes('@') ? row.email.split('@')[0] : '') ||
        `coord_${row.id.slice(-6)}`;
      const sent = await sendRecoveryCredentialsEmail(emailNorm, loginName, plain);
      const isDev = process.env.NODE_ENV !== 'production';
      if (!sent && !isDev) {
        return NextResponse.json(
          { success: false, message: 'Verified, but failed to send email. Contact support.' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Sign-in details were sent to your email. You must set a new password after logging in.',
        ...(isDev && { devTemporaryPassword: plain, devLoginUsername: loginName }),
      });
    }

    const row = await prisma.ticketRequester.findUnique({
      where: { id: requester.id },
      select: { username: true },
    });
    await prisma.ticketRequester.update({
      where: { id: requester.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        hasUpdatedCredentials: false,
      },
    });
    const loginName = row?.username ?? usernameOrEmail;
    const sent = await sendRecoveryCredentialsEmail(emailNorm, loginName, plain);
    const isDev = process.env.NODE_ENV !== 'production';
    if (!sent && !isDev) {
      return NextResponse.json(
        { success: false, message: 'Verified, but failed to send email. Contact support.' },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      message: 'Sign-in details were sent to your email. You must set a new password after logging in.',
      ...(isDev && { devTemporaryPassword: plain, devLoginUsername: loginName }),
    });
  } catch (e) {
    console.error('POST /api/auth/requester-reset-password:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
