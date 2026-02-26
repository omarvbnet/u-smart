import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const checklists = await prisma.inspectionChecklist.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        items: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, checklists });
  } catch (error) {
    console.error('GET /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch checklists' }, { status: 500 });
  }
}
