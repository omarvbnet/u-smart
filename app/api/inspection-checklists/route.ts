import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';
import { ensureLegacyRequesterCompany } from '@/lib/ensure-legacy-requester-company';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const CHECKLIST_EDITOR_ROLES = new Set([
  'COMPANY_OWNER',
  'COORDINATOR',
  'ADMIN',
  'MANAGER',
  'TEAM_LEADER',
  'ENGINEER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
  'TECHNICIAN',
  'CLIENT',
  'COMPANY',
]);

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
    const archiveScope = searchParams.get('archiveScope')?.trim().toLowerCase() || '';

    let companyScopeId: string | null = null;
    if (coordinatorContext) {
      companyScopeId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      companyScopeId = await ensureLegacyRequesterCompany(auth.payload.requesterId);
    }

    if (!companyScopeId) {
      return NextResponse.json(
        { success: false, message: 'Checklists are only available for company provider accounts.' },
        { status: 403 }
      );
    }

    let privateCompanyStaff = false;
    if (auth.payload.identitySource === 'ticket_requester') {
      const tr = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { privateCompanyId: true },
      });
      privateCompanyStaff = !!tr?.privateCompanyId;
    }

    // Private-workspace field staff must not see global (companyId null) templates mixed with their workspace.
    const baseOr: Record<string, unknown>[] = privateCompanyStaff
      ? [{ companyId: companyScopeId }]
      : [{ companyId: companyScopeId }, { companyId: null }];

    let where: Record<string, unknown>;

    if (archiveScope === 'mine') {
      where = {
        AND: [
          { archived: true },
          { createdByRequesterId: auth.payload.requesterId },
          { OR: baseOr },
        ],
      };
    } else {
      where = {
        AND: [{ archived: false }, { OR: baseOr }],
      };
    }
    if (taskCategory) {
      (where.AND as Record<string, unknown>[]).push({ taskCategory });
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
        archived: true,
        createdByRequesterId: true,
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
      if (
        !CHECKLIST_EDITOR_ROLES.has(String(coordinatorContext.role)) &&
        !hasPrivilege(coordinatorContext.privileges, 'MANAGE_CHECKLISTS')
      ) {
        return NextResponse.json(
          { success: false, message: 'Only company owner or coordinator can create checklists.' },
          { status: 403 }
        );
      }
      companyId = coordinatorContext.companyId;
    } else if (auth.payload.identitySource === 'ticket_requester') {
      const tr = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true },
      });
      const rr = (tr?.role ?? 'COMPANY').toUpperCase();
      const mayCreateChecklist = new Set([
        'ENGINEER',
        'QUALITY_ENGINEER',
        'SUPERVISION_ENGINEER',
        'COMPANY',
        'PERSONAL',
        'MANAGER',
        'COORDINATOR',
        'TECHNICIAN',
      ]);
      if (!mayCreateChecklist.has(rr)) {
        return NextResponse.json(
          { success: false, message: 'Your role cannot create checklist templates.' },
          { status: 403 }
        );
      }
      companyId = await ensureLegacyRequesterCompany(auth.payload.requesterId);
      if (!companyId) {
        return NextResponse.json(
          { success: false, message: 'Could not initialize your company provider workspace yet.' },
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

    let createdByRequesterId: string | null = null;
    if (!coordinatorContext && auth.payload.identitySource === 'ticket_requester') {
      createdByRequesterId = auth.payload.requesterId;
    }

    const checklist = await prisma.inspectionChecklist.create({
      data: {
        name,
        items,
        companyId,
        taskCategory: taskCategory || null,
        techniqueTypes,
        createdByRequesterId,
      },
    });
    return NextResponse.json({ success: true, checklist });
  } catch (error) {
    console.error('POST /api/inspection-checklists:', error);
    return NextResponse.json({ success: false, message: 'Failed to create checklist' }, { status: 500 });
  }
}
