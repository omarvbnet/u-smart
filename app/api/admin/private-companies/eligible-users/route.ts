import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') return null;
  return payload;
}

/**
 * GET /api/admin/private-companies/eligible-users?q=search
 *
 * Returns COMPANY-role TicketRequesters who do NOT already own (or belong to)
 * a private workspace. Used by the admin "Promote existing user" picker.
 */
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  try {
    const where: Record<string, unknown> = {
      role: 'COMPANY',
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      privateCompanyOwned: { is: null },
      privateCompanyId: null,
    };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await prisma.ticketRequester.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        province: true,
        status: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ success: true, users: rows });
  } catch (err) {
    console.error('GET /api/admin/private-companies/eligible-users:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch users' }, { status: 500 });
  }
}
