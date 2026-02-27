import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createRequesterToken, getRequesterCookieOptions, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Username and password required' },
        { status: 400 }
      );
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { username },
    });

    if (!requester) {
      return NextResponse.json(
        { success: false, message: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, requester.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const role = (requester as { role?: string }).role ?? 'COMPANY';
    const province = (requester as { province?: string | null }).province ?? null;
    const provinceFilterActive = (requester as { provinceFilterActive?: boolean }).provinceFilterActive ?? true;
    const token = createRequesterToken({
      requesterId: requester.id,
      username: requester.username,
      name: requester.name,
      role,
    });

    const res = NextResponse.json({
      success: true,
      token,
      user: {
        id: requester.id,
        username: requester.username,
        name: requester.name,
        role,
        province,
        provinceFilterActive,
      },
    });

    res.cookies.set(REQUESTER_COOKIE_NAME, token, getRequesterCookieOptions());
    return res;
  } catch (error) {
    console.error('Requester login error:', error);
    return NextResponse.json(
      { success: false, message: 'Login failed' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
