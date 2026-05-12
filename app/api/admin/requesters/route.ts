import { NextRequest, NextResponse } from 'next/server';
import { RequesterRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

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
        phonePushToken: true,
        phonePlatform: true,
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
        phonePushToken: (r as { phonePushToken?: string | null }).phonePushToken ?? null,
        phonePlatform: (r as { phonePlatform?: string | null }).phonePlatform ?? null,
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

  const VALID_ROLES: RequesterRole[] = ['COMPANY', 'PERSONAL', 'ENGINEER', 'TECHNICIAN', 'WORKER'];

  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : generateUsername();
    const password = typeof body.password === 'string' ? body.password : generatePassword();
    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() || null : null;
    const email = typeof body.email === 'string' ? body.email.trim() || null : null;
    const roleRaw = typeof body.role === 'string' ? (body.role as string).toUpperCase() : 'COMPANY';
    const role: RequesterRole = VALID_ROLES.includes(roleRaw as RequesterRole) ? (roleRaw as RequesterRole) : 'COMPANY';
    const serviceSlug = (role === 'ENGINEER' || role === 'TECHNICIAN' || role === 'WORKER')
      ? 'quality-control-supervision'
      : (typeof body.serviceSlug === 'string' ? body.serviceSlug : 'enterprise-networking');

    if (!phone) {
      return NextResponse.json({ success: false, message: 'Phone is required' }, { status: 400 });
    }
    if (!SERVICE_SLUGS.includes(serviceSlug as (typeof SERVICE_SLUGS)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid service slug' }, { status: 400 });
    }

    const phoneCheck = await checkPhoneUnique(prisma, phone);
    if (phoneCheck.taken) {
      return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone number already in use' }, { status: 400 });
    }
    if (email) {
      const emailCheck = await checkEmailUnique(prisma, email);
      if (emailCheck.taken) {
        return NextResponse.json({ success: false, message: emailCheck.message ?? 'Email already in use' }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const qcFieldRoles = new Set(['ENGINEER', 'TECHNICIAN', 'WORKER']);
    const verificationExtras = qcFieldRoles.has(role)
      ? { verificationStatus: 'APPROVED' as const, verifiedAt: new Date() }
      : {};

    const requester = await prisma.ticketRequester.create({
      data: {
        username,
        passwordHash,
        name,
        email,
        phone,
        company,
        role,
        serviceSlug: serviceSlug as (typeof SERVICE_SLUGS)[number],
        ...verificationExtras,
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        company: true,
        serviceSlug: true,
        status: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      requester: {
        ...requester,
        status: (requester as { status?: string }).status ?? 'ACTIVE',
        role: (requester as { role?: string }).role ?? role,
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
