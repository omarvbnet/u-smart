import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { notifyChecklistUpdatedForDepartment } from '@/lib/private-company-checklist-notify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const TASK_CATEGORIES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'] as const;
const CAN_MANAGE_CHECKLIST_ROLES = new Set(['MANAGER', 'COORDINATOR']);

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

async function getMemberContext(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'No workspace.' }, { status: 403 }) };
  }
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
  const role = String(me?.role ?? '').toUpperCase();
  const isOwner =
    !!m.ownedCompanyId &&
    m.ownedCompanyStatus === 'APPROVED' &&
    m.ownedCompanyId === m.effectiveCompanyId;
  return {
    ok: true as const,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner,
    role,
    canManage: isOwner || CAN_MANAGE_CHECKLIST_ROLES.has(role),
  };
}

const checklistSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  techniqueTypes: true,
  items: true,
  createdById: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, username: true, role: true } },
} as const;

/** GET — single checklist (all workspace members). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getMemberContext(req);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Checklist id required.' }, { status: 400 });
  }

  const checklist = await prisma.privateCompanyChecklist.findFirst({
    where: { id, companyId: ctx.companyId },
    select: checklistSelect,
  });
  if (!checklist) {
    return NextResponse.json({ success: false, message: 'Checklist not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, checklist });
}

/** PATCH — owner / manager / coordinator update checklist + notify department staff. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getMemberContext(req);
  if (!ctx.ok) return ctx.response;
  if (!ctx.canManage) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner, managers, or coordinators can update checklists.',
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Checklist id required.' }, { status: 400 });
  }

  const existing = await prisma.privateCompanyChecklist.findFirst({
    where: { id, companyId: ctx.companyId },
    select: { id: true, name: true, departmentId: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Checklist not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ success: false, message: 'Name is required.' }, { status: 400 });
  }
  const description =
    typeof body?.description === 'string' ? body.description.trim() : '';
  const categoryRaw =
    typeof body?.category === 'string' ? body.category.trim().toUpperCase() : '';
  const category =
    categoryRaw && (TASK_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? categoryRaw
      : null;
  const techniqueTypes = Array.isArray(body?.techniqueTypes)
    ? body.techniqueTypes
        .map((t: unknown) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
        .filter((t: string) => t.length > 0)
    : undefined;
  const items = body?.items !== undefined ? normalizeItems(body.items) : undefined;
  if (body?.items !== undefined && !items) {
    return NextResponse.json(
      { success: false, message: 'At least one checklist item with a label is required.' },
      { status: 400 }
    );
  }

  let departmentId: string | null | undefined;
  if (body?.departmentId === null || body?.departmentId === '') {
    departmentId = null;
  } else if (typeof body?.departmentId === 'string' && body.departmentId.trim()) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: body.departmentId.trim(), companyId: ctx.companyId },
      select: { id: true },
    });
    if (!dept) {
      return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
    }
    departmentId = dept.id;
  }

  const updated = await prisma.privateCompanyChecklist.update({
    where: { id },
    data: {
      name,
      description: description || null,
      category,
      ...(techniqueTypes !== undefined ? { techniqueTypes } : {}),
      ...(items !== undefined ? { items } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
    },
    select: checklistSelect,
  });

  const notifyDepartmentId =
    departmentId !== undefined ? departmentId : (existing.departmentId as string | null);

  notifyChecklistUpdatedForDepartment({
    companyId: ctx.companyId,
    departmentId: notifyDepartmentId,
    checklistId: id,
    checklistName: name,
    excludeRequesterId: ctx.requesterId,
  }).catch((e) => console.error('notifyChecklistUpdatedForDepartment:', e));

  return NextResponse.json({ success: true, checklist: updated });
}
