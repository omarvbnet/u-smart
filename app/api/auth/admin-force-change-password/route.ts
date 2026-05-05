import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME, createToken, getAuthCookieOptions } from '@/lib/auth';

/**
 * Dashboard admin: change password while `mustChangePassword` is true (temporary recovery password).
 * Requires current temporary password — no OTP.
 */
export async function POST(req: NextRequest) {
  try {
    const tokenRaw = req.cookies.get(COOKIE_NAME)?.value;
    if (!tokenRaw) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const session = verifyToken(tokenRaw);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
        mustChangePassword: true,
      },
    });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }
    if (user.mustChangePassword !== true) {
      return NextResponse.json(
        { success: false, message: 'Password change not required for this session.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Current password and new password (min 6 characters) are required' },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ success: false, message: 'Current password is incorrect' }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash, mustChangePassword: false },
    });

    const nextToken = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: false,
    });

    const res = NextResponse.json({
      success: true,
      message: 'Password updated.',
      mustChangePassword: false,
    });
    res.cookies.set(COOKIE_NAME, nextToken, getAuthCookieOptions());
    return res;
  } catch (e) {
    console.error('POST /api/auth/admin-force-change-password:', e);
    return NextResponse.json({ success: false, message: 'Failed to update password' }, { status: 500 });
  }
}
