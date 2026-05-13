import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';

const prisma = _prisma as any;

const COORD_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Checklist id required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const archived = typeof body.archived === 'boolean' ? body.archived : undefined;
    const itemsRaw = Array.isArray(body.items) ? body.items : undefined;

    if (name === undefined && archived === undefined && itemsRaw === undefined) {
      return NextResponse.json(
        { success: false, message: 'Provide name, items, and/or archived' },
        { status: 400 }
      );
    }

    const existing = await prisma.inspectionChecklist.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        createdByRequesterId: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Checklist not found' }, { status: 404 });
    }

    const coordinatorContext = await getCoordinatorContext(req);
    if (coordinatorContext) {
      const canEdit =
        COORD_ROLES.has(String(coordinatorContext.role)) ||
        hasPrivilege(coordinatorContext.privileges, 'MANAGE_CHECKLISTS');
      if (!canEdit) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      const scopeOk =
        existing.companyId === coordinatorContext.companyId ||
        (existing.companyId == null && String(coordinatorContext.role).toUpperCase() === 'ADMIN');
      if (!scopeOk) {
        return NextResponse.json({ success: false, message: 'Checklist is outside your company' }, { status: 403 });
      }
    } else if (auth.payload.identitySource === 'ticket_requester') {
      const tr = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { role: true },
      });
      const r = (tr?.role ?? '').toUpperCase();
      const fieldEngineer = r === 'ENGINEER' || r === 'QUALITY_ENGINEER' || r === 'SUPERVISION_ENGINEER';
      if (!fieldEngineer) {
        return NextResponse.json({ success: false, message: 'Only engineers can edit their checklists here.' }, { status: 403 });
      }
      if (existing.createdByRequesterId !== auth.payload.requesterId) {
        return NextResponse.json(
          { success: false, message: 'You can only edit checklists you created.' },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    let items: unknown = undefined;
    if (itemsRaw) {
      items = itemsRaw
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
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ success: false, message: 'items must be a non-empty array when provided' }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name) return NextResponse.json({ success: false, message: 'name cannot be empty' }, { status: 400 });
      data.name = name;
    }
    if (archived !== undefined) data.archived = archived;
    if (items !== undefined) data.items = items;

    const updated = await prisma.inspectionChecklist.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, checklist: updated });
  } catch (error) {
    console.error('PATCH /api/inspection-checklists/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update checklist' }, { status: 500 });
  }
}
