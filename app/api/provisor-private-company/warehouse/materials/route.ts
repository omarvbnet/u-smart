import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_TRACKING = new Set(['SERIAL', 'BULK']);

function normalizeName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** GET — list every material in the workspace catalog, with item counts. */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const materials = await prisma.privateCompanyMaterial.findMany({
    where: { companyId: guard.companyId },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      unit: true,
      iconKey: true,
      color: true,
      tracking: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });
  return NextResponse.json({
    success: true,
    materials: materials.map((m: { _count: { items: number } } & Record<string, unknown>) => ({
      ...m,
      itemCount: m._count.items,
      _count: undefined,
    })),
  });
}

/** POST — create a new material (catalog entry). Manager-level only. */
export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const name = normalizeName(body?.name);
  if (!name) {
    return NextResponse.json(
      { success: false, message: 'Name is required.' },
      { status: 400 }
    );
  }
  const trackingRaw = typeof body?.tracking === 'string' ? body.tracking.toUpperCase() : 'SERIAL';
  const tracking = VALID_TRACKING.has(trackingRaw) ? trackingRaw : 'SERIAL';
  try {
    const created = await prisma.privateCompanyMaterial.create({
      data: {
        companyId: guard.companyId,
        name,
        description: typeof body?.description === 'string' ? body.description.trim() || null : null,
        category: typeof body?.category === 'string' ? body.category.trim() || null : null,
        unit: typeof body?.unit === 'string' ? body.unit.trim() || null : null,
        iconKey: typeof body?.iconKey === 'string' ? body.iconKey.trim() || null : null,
        color: typeof body?.color === 'string' ? body.color.trim() || null : null,
        tracking,
        createdById: guard.requesterId,
      },
    });
    return NextResponse.json({ success: true, material: created });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'A material with this name already exists.' },
        { status: 409 }
      );
    }
    console.error('POST /warehouse/materials:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to create material.' },
      { status: 500 }
    );
  }
}

/** PATCH — update a catalog entry. */
export async function PATCH(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const existing = await prisma.privateCompanyMaterial.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (body?.description !== undefined)
    data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
  if (body?.category !== undefined)
    data.category = typeof body.category === 'string' ? body.category.trim() || null : null;
  if (body?.unit !== undefined)
    data.unit = typeof body.unit === 'string' ? body.unit.trim() || null : null;
  if (body?.iconKey !== undefined)
    data.iconKey = typeof body.iconKey === 'string' ? body.iconKey.trim() || null : null;
  if (body?.color !== undefined)
    data.color = typeof body.color === 'string' ? body.color.trim() || null : null;
  if (typeof body?.tracking === 'string') {
    const t = body.tracking.toUpperCase();
    if (VALID_TRACKING.has(t)) data.tracking = t;
  }
  try {
    const updated = await prisma.privateCompanyMaterial.update({ where: { id }, data });
    return NextResponse.json({ success: true, material: updated });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'A material with this name already exists.' },
        { status: 409 }
      );
    }
    console.error('PATCH /warehouse/materials:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to update material.' },
      { status: 500 }
    );
  }
}

/** DELETE — only allowed when there are no items left attached. */
export async function DELETE(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const m = await prisma.privateCompanyMaterial.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, _count: { select: { items: true } } },
  });
  if (!m) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  if (m._count.items > 0) {
    return NextResponse.json(
      {
        success: false,
        message: 'Cannot delete a material that still has items. Retire or reassign its items first.',
      },
      { status: 409 }
    );
  }
  await prisma.privateCompanyMaterial.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
