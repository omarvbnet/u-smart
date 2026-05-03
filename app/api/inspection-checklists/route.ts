import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    const { searchParams } = new URL(req.url);
    const taskCategory = searchParams.get('taskCategory')?.trim().toUpperCase() || '';
    const technique = searchParams.get('technique')?.trim().toLowerCase() || '';
    const where: Record<string, unknown> = {};
    if (coordinatorContext) {
      where.OR = [{ companyId: coordinatorContext.companyId }, { companyId: null }];
    }
    if (taskCategory) {
      where.taskCategory = taskCategory;
    }
    const checklists = await prisma.inspectionChecklist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        items: true,
        companyId: true,
        taskCategory: true,
        techniqueTypes: true,
        createdAt: true,
      },
    });
    const filtered = technique
      ? (checklists as Array<{ techniqueTypes?: string[] | null }>).filter((c) => {
          const arr = Array.isArray(c.techniqueTypes) ? c.techniqueTypes : [];
          return arr.length === 0 || arr.includes(technique);
        })
      : checklists;

    return NextResponse.json({ success: true, checklists: filtered });
  } catch (error) {
    console.error('GET /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch checklists' }, { status: 500 });
  }
}
