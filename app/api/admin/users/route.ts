import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ROLES = ['ADMIN', 'EDITOR', 'USER', 'TECHNICAL', 'ENGINEER'] as const;

// List users: ?all=true returns all users (ADMIN only); otherwise team members only
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(token);
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === 'true';

  try {
    const userDelegate = (prisma as any).user;
    if (!userDelegate?.findMany) {
      return NextResponse.json({ success: true, users: [] });
    }

    const isAdmin = payload?.role === 'ADMIN';
    const where = all && isAdmin
      ? {}
      : { role: { in: ['ADMIN', 'EDITOR', 'TECHNICAL', 'ENGINEER'] } };

    const users = await userDelegate.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, users, isAdmin: all ? isAdmin : undefined });
  } catch (err) {
    console.error('GET /api/admin/users:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch users' }, { status: 500 });
  }
}

// Create new User (ADMIN only)
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }
  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : null;
    const role = typeof body.role === 'string' ? body.role.toUpperCase() : 'USER';

    if (!email) {
      return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    const existing = await (prisma as any).user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ success: false, message: 'Email already in use' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await (prisma as any).user.create({
      data: {
        email,
        password: passwordHash,
        name: name || null,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, user });
  } catch (err) {
    console.error('POST /api/admin/users:', err);
    return NextResponse.json({ success: false, message: 'Failed to create user' }, { status: 500 });
  }
}
