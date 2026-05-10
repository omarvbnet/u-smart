import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { CAN_CREATE_CHECKLIST_ROLES, getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const TASK_CATEGORIES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'] as const;

type ChecklistItemInput = {
  id?: string;
  label?: unknown;
  weight?: unknown;
  required?: unknown;
  severity?: unknown;
};

type StoredChecklistItem = {
  id: string;
  label: string;
  weight?: string;
  required?: boolean;
  severity: 'minor' | 'major';
};

function normalizeItems(raw: unknown): StoredChecklistItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((it) => {
      const item = it as ChecklistItemInput;
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label) return null;
      const sev = typeof item.severity === 'string' ? item.severity.trim().toLowerCase() : '';
      const severity: 'minor' | 'major' = sev === 'major' ? 'major' : 'minor';
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomBytes(6).toString('hex'),
        label,
        weight: typeof item.weight === 'string' ? item.weight.trim() : undefined,
        required: item.required === true ? true : undefined,
        severity,
      } satisfies StoredChecklistItem;
    })
    .filter(Boolean) as StoredChecklistItem[];
  if (items.length === 0) return null;
  return items;
}

async function getCreatorContext(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 }) };
  }
  // Staff workspaces must be the workspace's APPROVED state — owner workspace status check
  const company = await prisma.privateCompany.findUnique({
    where: { id: m.effectiveCompanyId },
    select: { status: true },
  });
  if (!company || company.status !== 'APPROVED') {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Workspace is not active.' }, { status: 403 }) };
  }
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true },
  });
  return {
    ok: true as const,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner: m.ownedCompanyId === m.effectiveCompanyId,
    role: String(me?.role ?? '').toUpperCase(),
  };
}

/** GET — list workspace checklists (visible to all members). */
export async function GET(req: NextRequest) {
  const ctx = await getCreatorContext(req);
  if (!ctx.ok) return ctx.response;
  const checklists = await prisma.privateCompanyChecklist.findMany({
    where: { companyId: ctx.companyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      techniqueTypes: true,
      items: true,
      createdById: true,
      departmentId: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, username: true, role: true } },
    },
  });
  return NextResponse.json({ success: true, checklists });
}

/** POST — engineers/managers/coordinators/owner create checklists. */
export async function POST(req: NextRequest) {
  const ctx = await getCreatorContext(req);
  if (!ctx.ok) return ctx.response;
  const allowed = ctx.isOwner || CAN_CREATE_CHECKLIST_ROLES.has(ctx.role);
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only managers, coordinators, engineers, or the owner can create checklists.',
      },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ success: false, message: 'Name is required.' }, { status: 400 });
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const categoryRaw = typeof body?.category === 'string' ? body.category.trim().toUpperCase() : '';
  const category = (TASK_CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : null;
  const techniqueTypes = Array.isArray(body?.techniqueTypes)
    ? body.techniqueTypes
        .map((t: unknown) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
        .filter((t: string) => t.length > 0)
    : [];
  const items = normalizeItems(body?.items);
  if (!items) {
    return NextResponse.json(
      { success: false, message: 'At least one checklist item with a label is required.' },
      { status: 400 }
    );
  }
  let departmentId: string | null = null;
  if (typeof body?.departmentId === 'string' && body.departmentId.trim()) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: body.departmentId.trim(), companyId: ctx.companyId },
      select: { id: true },
    });
    if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
    departmentId = dept.id;
  }

  const created = await prisma.privateCompanyChecklist.create({
    data: {
      companyId: ctx.companyId,
      name,
      description: description || null,
      category,
      techniqueTypes,
      items,
      createdById: ctx.requesterId,
      departmentId,
    },
  });
  return NextResponse.json({ success: true, checklist: created });
}

/** DELETE — owner or creator removes a checklist. */
export async function DELETE(req: NextRequest) {
  const ctx = await getCreatorContext(req);
  if (!ctx.ok) return ctx.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const checklist = await prisma.privateCompanyChecklist.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, createdById: true },
  });
  if (!checklist) return NextResponse.json({ success: false, message: 'Checklist not found.' }, { status: 404 });
  if (!ctx.isOwner && checklist.createdById !== ctx.requesterId) {
    return NextResponse.json({ success: false, message: 'Only the owner or creator can delete this checklist.' }, { status: 403 });
  }
  await prisma.privateCompanyChecklist.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
