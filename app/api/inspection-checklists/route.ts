import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const CHECKLIST_EDITOR_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN']);

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

    let companyScopeId: string | null = null;
    if (coordinatorContext) {
      companyScopeId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      const tr = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true, username: true, email: true },
      });
      const role = String((tr as { role?: string })?.role ?? '').toUpperCase();
      if (role === 'COMPANY') {
        companyScopeId = await getLinkedCoordinatorCompanyId(_prisma, {
          id: auth.payload.requesterId,
          username: (tr as { username?: string }).username ?? '',
          email: (tr as { email?: string | null }).email ?? null,
          role,
        });
      }
    }

    if (!companyScopeId) {
      return NextResponse.json(
        { success: false, message: 'Checklists are only available for company provider accounts.' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = {
      OR: [{ companyId: companyScopeId }, { companyId: null }],
    };
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

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    let companyId: string | null = null;
    if (coordinatorContext) {
      if (!CHECKLIST_EDITOR_ROLES.has(String(coordinatorContext.role))) {
        return NextResponse.json(
          { success: false, message: 'Only company owner or coordinator can create checklists.' },
          { status: 403 }
        );
      }
      companyId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      const tr = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true, username: true, email: true },
      });
      const role = String((tr as { role?: string })?.role ?? '').toUpperCase();
      if (role !== 'COMPANY') {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      companyId = await getLinkedCoordinatorCompanyId(_prisma, {
        id: auth.payload.requesterId,
        username: (tr as { username?: string }).username ?? '',
        email: (tr as { email?: string | null }).email ?? null,
        role,
      });
      if (!companyId) {
        return NextResponse.json(
          { success: false, message: 'Link a coordinator company account to manage checklists.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const taskCategory = typeof body.taskCategory === 'string' ? body.taskCategory.trim().toUpperCase() : null;
    const techniqueTypes = Array.isArray(body.techniqueTypes)
      ? body.techniqueTypes.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .filter((x: unknown) => x && typeof x === 'object' && 'label' in x && typeof (x as { label: unknown }).label === 'string')
      .map((x: { label: string; id?: string; weight?: string }) => {
        const w = typeof x.weight === 'string' && (x.weight === 'minor' || x.weight === 'major') ? x.weight : 'minor';
        return {
          id: typeof x.id === 'string' ? x.id : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          label: String(x.label).trim(),
          weight: w,
        };
      })
      .filter((x: { label: string }) => x.label.length > 0);

    if (!name) {
      return NextResponse.json({ success: false, message: 'Checklist name is required' }, { status: 400 });
    }

    const checklist = await prisma.inspectionChecklist.create({
      data: {
        name,
        items,
        companyId,
        taskCategory: taskCategory || null,
        techniqueTypes,
      },
    });
    return NextResponse.json({ success: true, checklist });
  } catch (error) {
    console.error('POST /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to create checklist' }, { status: 500 });
  }
}
