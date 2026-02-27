import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

const prisma = _prisma as any;

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
    const engineers = await prisma.ticketRequester.findMany({
      where: { role: 'ENGINEER', serviceSlug: 'quality-control-supervision' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: { select: { tickets: true } },
      },
    });

    const engineerIds = engineers.map((e: { id: string }) => e.id);

    // Get active ticket counts per engineer by checking company JSON for assignedEngineerId
    const allTickets = await prisma.visitorRequest.findMany({
      where: {
        serviceSlug: 'quality-control-supervision',
        status: { not: 'COMPLETED' },
      },
      select: { id: true, status: true, company: true },
    });

    const activeCountMap: Record<string, number> = {};
    const completedCountMap: Record<string, number> = {};
    const totalAssignedMap: Record<string, number> = {};

    for (const t of allTickets) {
      try {
        const parsed = typeof t.company === 'string' ? JSON.parse(t.company) : {};
        const aId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
        if (aId && engineerIds.includes(aId)) {
          activeCountMap[aId] = (activeCountMap[aId] ?? 0) + 1;
          totalAssignedMap[aId] = (totalAssignedMap[aId] ?? 0) + 1;
        }
      } catch { /* ignore */ }
    }

    const completedTickets = await prisma.visitorRequest.findMany({
      where: {
        serviceSlug: 'quality-control-supervision',
        status: 'COMPLETED',
      },
      select: { company: true },
    });

    for (const t of completedTickets) {
      try {
        const parsed = typeof t.company === 'string' ? JSON.parse(t.company) : {};
        const aId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
        if (aId && engineerIds.includes(aId)) {
          completedCountMap[aId] = (completedCountMap[aId] ?? 0) + 1;
          totalAssignedMap[aId] = (totalAssignedMap[aId] ?? 0) + 1;
        }
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      success: true,
      engineers: engineers.map((e: { id: string; username: string; name: string | null; phone: string; status?: string; createdAt: Date; _count: { tickets: number } }) => ({
        id: e.id,
        username: e.username,
        name: e.name,
        phone: e.phone,
        status: e.status ?? 'ACTIVE',
        createdAt: e.createdAt,
        activeTickets: activeCountMap[e.id] ?? 0,
        completedTickets: completedCountMap[e.id] ?? 0,
        totalAssigned: totalAssignedMap[e.id] ?? 0,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/engineers:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch engineers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!username || !password) {
      return NextResponse.json({ success: false, message: 'Username and password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: 'Phone is required' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const engineer = await prisma.ticketRequester.create({
      data: {
        username,
        passwordHash,
        name,
        email: null,
        phone,
        company: null,
        serviceSlug: 'quality-control-supervision',
        role: 'ENGINEER',
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      engineer: {
        ...engineer,
        status: engineer.status ?? 'ACTIVE',
        activeTickets: 0,
        completedTickets: 0,
        totalAssigned: 0,
      },
      credentials: { username, password },
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'Username already exists' }, { status: 400 });
    }
    console.error('POST /api/admin/engineers:', err);
    return NextResponse.json({ success: false, message: 'Failed to create engineer' }, { status: 500 });
  }
}
