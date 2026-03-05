import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SERVICE_SLUGS = ['enterprise-networking', 'quality-control-supervision'] as const;

function generateUsername(): string {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const requesters = await prisma.ticketRequester.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        company: true,
        companyCertificationUrl: true,
        status: true,
        role: true,
        createdAt: true,
        _count: { select: { tickets: true } },
      },
    });
    return NextResponse.json({
      success: true,
      requesters: requesters.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        phone: r.phone,
        company: r.company,
        companyCertificationUrl: r.companyCertificationUrl,
        status: (r as { status?: string }).status ?? 'ACTIVE',
        role: (r as { role?: string }).role ?? 'COMPANY',
        createdAt: r.createdAt,
        ticketCount: r._count.tickets,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/requesters:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch requesters' }, { status: 500 });
  }
}

// Create new TicketRequester (ADMIN only)
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
    const username = typeof body.username === 'string' ? body.username.trim() : generateUsername();
    const password = typeof body.password === 'string' ? body.password : generatePassword();
    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() || null : null;
    const serviceSlug = typeof body.serviceSlug === 'string' ? body.serviceSlug : 'enterprise-networking';

    if (!phone) {
      return NextResponse.json({ success: false, message: 'Phone is required' }, { status: 400 });
    }
    if (!SERVICE_SLUGS.includes(serviceSlug as (typeof SERVICE_SLUGS)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid service slug' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const requester = await prisma.ticketRequester.create({
      data: {
        username,
        passwordHash,
        name,
        email: null,
        phone,
        company,
        serviceSlug: serviceSlug as (typeof SERVICE_SLUGS)[number],
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        company: true,
        serviceSlug: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      requester: {
        ...requester,
        status: (requester as { status?: string }).status ?? 'ACTIVE',
      },
      credentials: { username, password },
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Username already exists' }, { status: 400 });
    }
    console.error('POST /api/admin/requesters:', err);
    return NextResponse.json({ success: false, message: 'Failed to create requester' }, { status: 500 });
  }
}
