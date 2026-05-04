import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma as _prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

const prisma = _prisma as any;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/admin/coordinator-companies — list all companies + staff count
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  try {
    const companies = await prisma.coordinatorCompany.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        freeTicketsUsed: true,
        freeTicketsLimit: true,
        activeTicketPlan: true,
        activeRateUsd: true,
        createdAt: true,
        _count: { select: { users: true, tickets: true } },
      },
    });
    return NextResponse.json({ success: true, companies });
  } catch (err) {
    console.error('GET coordinator-companies:', err);
    return NextResponse.json({ success: false, message: 'DB error' }, { status: 500 });
  }
}

// POST /api/admin/coordinator-companies — create a company + owner account
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const ownerFirstName = typeof body.ownerFirstName === 'string' ? body.ownerFirstName.trim() : '';
    const ownerLastName = typeof body.ownerLastName === 'string' ? body.ownerLastName.trim() : '';
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '';
    const ownerPassword = typeof body.ownerPassword === 'string' ? body.ownerPassword : '';

    if (!companyName || !ownerFirstName || !ownerEmail || !ownerPassword) {
      return NextResponse.json(
        { success: false, message: 'companyName, ownerFirstName, ownerEmail, and ownerPassword are required.' },
        { status: 400 },
      );
    }

    // Build slug from name
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) + '-' + Date.now().toString().slice(-6);

    // Build username from first name
    const baseUsername = ownerFirstName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'owner';
    let username = baseUsername;
    for (let i = 0; i < 10; i++) {
      const existing = await prisma.coordinatorUser.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!existing) break;
      username = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;
    }

    const hash = await bcrypt.hash(ownerPassword, 10);

    const company = await prisma.coordinatorCompany.create({
      data: {
        slug,
        name: companyName,
        freeTicketsLimit: 50,
        freeTicketsUsed: 0,
      },
    });

    const owner = await prisma.coordinatorUser.create({
      data: {
        username,
        email: ownerEmail,
        name: [ownerFirstName, ownerLastName].filter(Boolean).join(' '),
        passwordHash: hash,
        role: 'COMPANY_OWNER',
        status: 'ACTIVE',
        mustChangePassword: false,
        companyId: company.id,
      },
      select: { id: true, username: true, email: true, name: true, role: true },
    });

    return NextResponse.json({
      success: true,
      company,
      owner,
      credentials: { username, password: ownerPassword },
    });
  } catch (err) {
    console.error('POST coordinator-companies:', err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}
