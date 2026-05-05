import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkEmailOtp } from '@/lib/email-otp-store';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  createRequesterToken,
  getRequesterCookieOptions,
  REQUESTER_COOKIE_NAME,
} from '@/lib/requester-auth';
import { decodeProfileSkills } from '@/lib/coordinator-access';

function jsonWithRequesterCookie(body: Record<string, unknown>, token?: string | null) {
  const res = NextResponse.json(body);
  if (token) {
    res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
  }
  return res;
}

/** Requester (Provisor) change password: OTP flow or immediate (temporary recovery password + mustChangePassword). */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const payload = auth.payload;
    const body = await req.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    if (payload.identitySource === 'coordinator_user') {
      const coordinatorUser = await (prisma as any).coordinatorUser.findUnique({
        where: { id: payload.requesterId },
        select: {
          id: true,
          email: true,
          status: true,
          passwordHash: true,
          mustChangePassword: true,
          username: true,
          name: true,
          role: true,
          companyId: true,
          profile: { select: { skills: true } },
        },
      });
      if (!coordinatorUser) {
        return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
      }
      if (coordinatorUser.status === 'BLOCKED') {
        return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
      }

      const emailNorm = String(coordinatorUser.email || '').toLowerCase();
      if (!emailNorm) {
        return NextResponse.json({ success: false, message: 'No email on file for this account.' }, { status: 400 });
      }

      const immediateRecovery =
        coordinatorUser.mustChangePassword === true &&
        currentPassword &&
        !code &&
        newPassword.length >= 6;

      if (immediateRecovery) {
        const valid = await bcrypt.compare(currentPassword, coordinatorUser.passwordHash);
        if (!valid) {
          return NextResponse.json({ success: false, message: 'Current password is incorrect' }, { status: 401 });
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await (prisma as any).coordinatorUser.update({
          where: { id: coordinatorUser.id },
          data: { passwordHash, mustChangePassword: false },
        });
        const username =
          (typeof coordinatorUser.username === 'string' && coordinatorUser.username.trim()) ||
          (typeof coordinatorUser.email === 'string' ? coordinatorUser.email.split('@')[0] : '') ||
          `coord_${coordinatorUser.id.slice(-6)}`;
        const access = decodeProfileSkills(
          coordinatorUser.profile?.skills ?? [],
          coordinatorUser.role ?? 'COORDINATOR'
        );
        const token = createRequesterToken({
          requesterId: coordinatorUser.id,
          username,
          name: coordinatorUser.name ?? null,
          role: coordinatorUser.role ?? 'COORDINATOR',
          companyId: coordinatorUser.companyId ?? null,
          mustChangePassword: false,
          identitySource: 'coordinator_user',
        });
        return jsonWithRequesterCookie(
          {
            success: true,
            message: 'Password has been updated successfully.',
            token,
            mustChangePassword: false,
            user: {
              mustChangePassword: false,
              username,
              name: coordinatorUser.name ?? null,
              role: coordinatorUser.role ?? 'COORDINATOR',
              departments: access.departments,
              privileges: access.privileges,
            },
          },
          token
        );
      }

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
            const record = await db.emailOtp.findFirst({ where: { email: emailNorm }, orderBy: { expiresAt: 'desc' } });
            if (record && new Date() <= record.expiresAt) {
              const digits = String(code).replace(/\D/g, '');
              const codeStr = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0');
              const storedDigits = String(record.code).replace(/\D/g, '');
              const storedCode = storedDigits.length >= 6 ? storedDigits.slice(-6) : storedDigits.padStart(6, '0');
              if (codeStr === storedCode) {
                valid = true;
                await db.emailOtp.deleteMany?.({ where: { email: emailNorm } });
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!valid) {
        return NextResponse.json({ success: false, message: 'Invalid or expired verification code' }, { status: 401 });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await (prisma as any).coordinatorUser.update({
        where: { id: coordinatorUser.id },
        data: { passwordHash, mustChangePassword: false },
      });
      const username =
        (typeof coordinatorUser.username === 'string' && coordinatorUser.username.trim()) ||
        (typeof coordinatorUser.email === 'string' ? coordinatorUser.email.split('@')[0] : '') ||
        `coord_${coordinatorUser.id.slice(-6)}`;
      const access = decodeProfileSkills(
        coordinatorUser.profile?.skills ?? [],
        coordinatorUser.role ?? 'COORDINATOR'
      );
      const token = createRequesterToken({
        requesterId: coordinatorUser.id,
        username,
        name: coordinatorUser.name ?? null,
        role: coordinatorUser.role ?? 'COORDINATOR',
        companyId: coordinatorUser.companyId ?? null,
        mustChangePassword: false,
        identitySource: 'coordinator_user',
      });
      return jsonWithRequesterCookie(
        {
          success: true,
          message: 'Password has been updated successfully.',
          token,
          mustChangePassword: false,
          user: {
            mustChangePassword: false,
            username,
            departments: access.departments,
            privileges: access.privileges,
          },
        },
        token
      );
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: {
        id: true,
        email: true,
        status: true,
        passwordHash: true,
        username: true,
        name: true,
        role: true,
        mustChangePassword: true,
        province: true,
        provinceFilterActive: true,
      },
    });

    if (!requester) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }

    const status = requester.status ?? 'ACTIVE';
    if (status === 'BLOCKED') {
      return NextResponse.json({ success: false, message: 'Account is blocked' }, { status: 403 });
    }

    const role = requester.role ?? 'COMPANY';
    const province = requester.province ?? null;
    const provinceFilterActive = requester.provinceFilterActive ?? true;
    const mustFlag = requester.mustChangePassword === true;
    const immediateRecovery = mustFlag && currentPassword && !code && newPassword.length >= 6;

    if (immediateRecovery) {
      const valid = await bcrypt.compare(currentPassword, requester.passwordHash);
      if (!valid) {
        return NextResponse.json({ success: false, message: 'Current password is incorrect' }, { status: 401 });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.ticketRequester.update({
        where: { id: requester.id },
        data: { passwordHash, hasUpdatedCredentials: true, mustChangePassword: false },
      });
      const token = createRequesterToken({
        requesterId: requester.id,
        username: requester.username,
        name: requester.name,
        role,
        identitySource: 'ticket_requester',
        companyId: null,
        mustChangePassword: false,
      });
      return jsonWithRequesterCookie(
        {
          success: true,
          message: 'Password has been updated successfully.',
          token,
          mustChangePassword: false,
          user: { mustChangePassword: false, username: requester.username },
        },
        token
      );
    }

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

    const email = requester.email;
    if (!email) {
      return NextResponse.json({ success: false, message: 'No email on file for this account.' }, { status: 400 });
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
      data: { passwordHash, hasUpdatedCredentials: true, mustChangePassword: false },
    });

    const token = createRequesterToken({
      requesterId: requester.id,
      username: requester.username,
      name: requester.name,
      role,
      identitySource: 'ticket_requester',
      companyId: null,
      mustChangePassword: false,
    });

    return jsonWithRequesterCookie(
      {
        success: true,
        message: 'Password has been updated successfully.',
        token,
        mustChangePassword: false,
        user: { mustChangePassword: false, province, provinceFilterActive, username: requester.username },
      },
      token
    );
  } catch (e) {
    console.error('POST /api/auth/requester-change-password:', e);
    return NextResponse.json({ success: false, message: 'Failed to update password' }, { status: 500 });
  }
}
