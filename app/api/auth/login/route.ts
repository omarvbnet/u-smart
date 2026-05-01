import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createToken, getAuthCookieOptions, COOKIE_NAME } from '@/lib/auth';
import { registerUserPushToken } from '@/lib/push-notifications';

const ALLOWED_ROLES = ['ADMIN', 'EDITOR'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
    const phonePlatform = typeof body.phonePlatform === 'string' ? body.phonePlatform.trim().toLowerCase() : '';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Access denied. Admin or Editor role required.' },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (pushToken) {
      try {
        await registerUserPushToken(prisma as any, user.id, pushToken, (phonePlatform as any) || 'unknown');
      } catch (e) {
        console.error('Failed to save user push token on login:', e);
      }
    }

    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    res.cookies.set(COOKIE_NAME, token, getAuthCookieOptions());
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
