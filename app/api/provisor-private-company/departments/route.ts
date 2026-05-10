import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const DEFAULT_COLORS = ['#6C63FF', '#00D4AA', '#FBBF24', '#38BDF8', '#FF9F43', '#A78BFA', '#4ADE80', '#FF4757'];

/**
 * Department mutations are workspace-wide structural changes, so we restrict
 * them to the workspace OWNER (the COMPANY-role requester). Managers and
 * coordinators can only manage staff inside existing departments.
 */
async function ownerOnly(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 }) };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.ownedCompanyId || m.ownedCompanyStatus !== 'APPROVED') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, message: 'Only the workspace owner can manage departments.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, requesterId: auth.payload.requesterId, companyId: m.ownedCompanyId };
}

/** GET — list departments for the workspace (owner OR staff). */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId) return NextResponse.json({ success: false, message: 'No workspace.' }, { status: 404 });
  const departments = await prisma.privateCompanyDepartment.findMany({
    where: { companyId: m.effectiveCompanyId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      iconKey: true,
      sortOrder: true,
      createdAt: true,
      members: {
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          specialization: true,
          status: true,
        },
      },
      _count: { select: { members: true } },
    },
  });
  return NextResponse.json({ success: true, departments });
}

/** POST — owner creates a department. */
export async function POST(req: NextRequest) {
  const guard = await ownerOnly(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ success: false, message: 'Name is required.' }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ success: false, message: 'Name is too long.' }, { status: 400 });
  }
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const color = typeof body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color.trim())
    ? body.color.trim()
    : DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
  const iconKey = typeof body?.iconKey === 'string' ? body.iconKey.trim() || null : null;
  const lastSort = await prisma.privateCompanyDepartment.findFirst({
    where: { companyId: guard.companyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  try {
    const dept = await prisma.privateCompanyDepartment.create({
      data: {
        companyId: guard.companyId,
        name,
        description: description || null,
        color,
        iconKey,
        sortOrder: (lastSort?.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json({ success: true, department: dept });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('POST departments:', err);
    return NextResponse.json({ success: false, message: 'Failed to create department.' }, { status: 500 });
  }
}

/** PATCH — owner updates a department. Body: { id, name?, description?, color?, iconKey?, sortOrder? } */
export async function PATCH(req: NextRequest) {
  const guard = await ownerOnly(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.description === 'string') data.description = body.description.trim() || null;
  if (typeof body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.color.trim())) data.color = body.color.trim();
  if (typeof body?.iconKey === 'string') data.iconKey = body.iconKey.trim() || null;
  if (Number.isFinite(body?.sortOrder)) data.sortOrder = Math.max(0, Math.floor(Number(body.sortOrder)));
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
  }
  try {
    const updated = await prisma.privateCompanyDepartment.update({ where: { id }, data });
    return NextResponse.json({ success: true, department: updated });
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ success: false, message: 'A department with this name already exists.' }, { status: 409 });
    }
    console.error('PATCH departments:', err);
    return NextResponse.json({ success: false, message: 'Failed to update department.' }, { status: 500 });
  }
}

/** DELETE — owner removes a department (and unlinks members). */
export async function DELETE(req: NextRequest) {
  const guard = await ownerOnly(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true },
  });
  if (!dept) return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  await prisma.privateCompanyDepartment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
