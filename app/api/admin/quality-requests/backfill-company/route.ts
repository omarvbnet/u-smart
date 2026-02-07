import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await prisma.visitorRequest.findMany({
      where: { serviceSlug: 'quality-control-supervision', requesterId: { not: null } },
      select: { id: true, company: true, requesterId: true },
    });

    let updated = 0;
    for (const r of rows) {
      if (!r.requesterId) continue;
      const j = typeof r.company === 'string' && r.company.startsWith('{')
        ? (() => {
            try {
              return JSON.parse(r.company) as Record<string, unknown>;
            } catch {
              return null;
            }
          })()
        : null;
      if (j && (j.company || j.companyName)) continue;
      const requester = await prisma.ticketRequester.findUnique({
        where: { id: r.requesterId },
        select: { company: true },
      });
      let companyVal: string | null = requester?.company?.trim() || null;
      if (!companyVal) {
        const comp = await (prisma as any).company?.findFirst?.({
          where: { requesterId: r.requesterId },
          select: { companyName: true },
        });
        companyVal = comp?.companyName?.trim() || null;
      }
      if (!companyVal) continue;
      let merged: Record<string, unknown>;
      if (typeof r.company === 'string' && r.company.startsWith('{')) {
        try {
          merged = { ...(JSON.parse(r.company) as Record<string, unknown>), company: companyVal };
        } catch {
          merged = { _ticket: 1, company: companyVal };
        }
      } else {
        merged = { _ticket: 1, company: companyVal };
      }
      await prisma.visitorRequest.update({
        where: { id: r.id },
        data: { company: JSON.stringify(merged) },
      });
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error('POST /api/admin/quality-requests/backfill-company:', err);
    return NextResponse.json({ success: false, message: 'Backfill failed' }, { status: 500 });
  }
}
