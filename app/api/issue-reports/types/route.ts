import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  try {
    const types = await prisma.issueReportType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, slug: true, label: true, description: true },
    });
    return NextResponse.json({ success: true, types });
  } catch (err) {
    console.error('GET /api/issue-reports/types:', err);
    return NextResponse.json({ success: true, types: [] });
  }
}
