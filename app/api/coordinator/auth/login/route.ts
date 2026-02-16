import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyPassword,
  createCoordinatorToken,
  COOKIE_NAME,
  getCoordinatorTokenFromRequest,
  verifyCoordinatorToken,
} from '@/lib/coordinator/auth';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = await prisma.coordinatorUser.findFirst({
      where: { email },
      include: { company: true },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = createCoordinatorToken({
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      action: 'login',
      resource: 'auth',
      ip: getClientIp(req),
    });

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
      },
    });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return res;
  } catch (e) {
    console.error('Coordinator login:', e);
    return NextResponse.json({ success: false, message: 'Login failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = getCoordinatorTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }
  const payload = verifyCoordinatorToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }
  const user = await prisma.coordinatorUser.findUnique({
    where: { id: payload.sub },
    include: { company: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
  }
  return NextResponse.json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company.name,
    },
  });
}
