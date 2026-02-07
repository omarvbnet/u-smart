import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const companyDelegate = (prisma as any).company;
    if (!companyDelegate?.findMany) {
      return NextResponse.json({ success: true, companies: [] });
    }
    const companies = await companyDelegate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const withCounts = await Promise.all(
      companies.map(async (c: { id: string; requesterId: string; requester?: { id: string } }) => {
        const rId = c.requesterId || (c.requester as any)?.id;
        const [ticketCount, siteCount] = await Promise.all([
          prisma.visitorRequest.count({ where: { requesterId: rId } }),
          (prisma as any).site?.count?.({ where: { requesterId: rId } }) ?? 0,
        ]);
        return {
          ...c,
          ticketCount,
          siteCount,
        };
      })
    );

    return NextResponse.json({ success: true, companies: withCounts });
  } catch (err) {
    console.error('GET /api/admin/companies:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch companies' }, { status: 500 });
  }
}
