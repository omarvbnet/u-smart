import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const TASK_CATEGORIES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'] as const;

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') return null;
  return payload;
}

type ChecklistItemInput = { id?: string; label?: unknown; weight?: unknown; required?: unknown };

function normalizeItems(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((it) => {
      const item = it as ChecklistItemInput;
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label) return null;
      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : crypto.randomBytes(6).toString('hex'),
        label,
        weight: typeof item.weight === 'string' ? item.weight.trim() : undefined,
        required: item.required === true ? true : undefined,
      };
    })
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

async function ensureWorkspace(id: string) {
  const ws = await prisma.privateCompany.findUnique({
    where: { id },
    select: { id: true, name: true, ownerRequesterId: true, status: true },
  });
  return ws;
}

/** GET — list workspace checklists (admin view, includes creator info). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  const ws = await ensureWorkspace(id);
  if (!ws) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  const checklists = await prisma.privateCompanyChecklist.findMany({
    where: { companyId: id },
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
  return NextResponse.json({ success: true, workspace: { id: ws.id, name: ws.name }, checklists });
}

/** POST — admin creates a checklist for the given workspace. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  const ws = await ensureWorkspace(id);
  if (!ws) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ success: false, message: 'Name is required.' }, { status: 400 });
  }
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
      where: { id: body.departmentId.trim(), companyId: id },
      select: { id: true },
    });
    if (!dept) {
      return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
    }
    departmentId = dept.id;
  }

  const created = await prisma.privateCompanyChecklist.create({
    data: {
      companyId: id,
      name,
      description: description || null,
      category,
      techniqueTypes,
      items,
      // Admin-authored checklists are created on behalf of the workspace owner.
      createdById: ws.ownerRequesterId,
      departmentId,
    },
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
    },
  });

  // Notify the owner so they see new checklists added by the admin.
  try {
    if (typeof prisma.notification?.create === 'function') {
      await prisma.notification.create({
        data: {
          type: 'private_company_checklist',
          title: 'Checklist added by admin',
          message: `An admin added the checklist "${name}" to your workspace "${ws.name}".`,
          requesterId: ws.ownerRequesterId,
          payload: { workspaceId: ws.id, checklistId: created.id, source: 'admin' },
        },
      });
    }
  } catch (e) {
    console.error('Notify owner (admin checklist):', e);
  }

  return NextResponse.json({ success: true, checklist: created });
}

/** DELETE — admin removes any workspace checklist by id. Query: ?checklistId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  const ws = await ensureWorkspace(id);
  if (!ws) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const checklistId = (searchParams.get('checklistId') ?? '').trim();
  if (!checklistId) {
    return NextResponse.json({ success: false, message: 'checklistId is required.' }, { status: 400 });
  }
  const row = await prisma.privateCompanyChecklist.findFirst({
    where: { id: checklistId, companyId: id },
    select: { id: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Checklist not found.' }, { status: 404 });
  }
  await prisma.privateCompanyChecklist.delete({ where: { id: checklistId } });
  return NextResponse.json({ success: true });
}
