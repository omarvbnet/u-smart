import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  logMovement,
  normalizeProvince,
  warehouseGuard,
} from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_STATUS = new Set([
  'IN_WAREHOUSE',
  'ASSIGNED',
  'USED',
  'DAMAGED',
  'LOST',
  'RETIRED',
]);

const ITEM_INCLUDE = {
  material: {
    select: { id: true, name: true, category: true, unit: true, color: true, tracking: true },
  },
  assignedTo: {
    select: { id: true, name: true, username: true, role: true, privateCompanyDepartmentId: true },
  },
  usedTicket: {
    select: { id: true, technique: true, province: true, siteName: true, status: true },
  },
};

/**
 * GET /api/provisor-private-company/warehouse/items
 *
 * Returns the full stock list for the workspace. Every approved member can
 * browse inventory (read-only); use `mine=1` to list only units assigned to
 * the current user.
 *
 * Query string filters:
 *   ?province=Baghdad
 *   ?status=ASSIGNED
 *   ?materialId=...
 *   ?assignedToId=...
 *   ?ticketId=...
 *   ?q=<serial-prefix-or-substring>
 *   ?mine=1   (engineers/technicians/workers: show only items assigned to me)
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = { companyId: guard.companyId };

  const status = searchParams.get('status');
  if (status && VALID_STATUS.has(status)) where.status = status;
  const province = normalizeProvince(searchParams.get('province'));
  if (province) where.province = province;
  const materialId = searchParams.get('materialId');
  if (materialId) where.materialId = materialId;
  const assignedToId = searchParams.get('assignedToId');
  if (assignedToId) where.assignedToId = assignedToId;
  const ticketId = searchParams.get('ticketId');
  if (ticketId) where.usedTicketId = ticketId;
  const q = (searchParams.get('q') ?? '').trim();
  if (q) {
    where.OR = [
      { serialNumber: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Optional ?mine=1 narrows the list to units currently assigned to the
  // caller (e.g. field staff checking their own kit). Omit the param to browse
  // the full workspace inventory read-only (all roles).
  if (searchParams.get('mine') === '1') {
    where.assignedToId = guard.requesterId;
  }

  const items = await prisma.privateCompanyMaterialItem.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: ITEM_INCLUDE,
    take: 500,
  });
  return NextResponse.json({ success: true, items });
}

/**
 * POST /api/provisor-private-company/warehouse/items
 *
 * Stocks a new physical unit (or a batch of units when `serialNumbers[]` is
 * provided). Manager-level only. Each unit is recorded with a province so
 * notifications & assignments can be routed by governorate.
 */
export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const materialId = typeof body?.materialId === 'string' ? body.materialId.trim() : '';
  const province = normalizeProvince(body?.province);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() || null : null;
  const qtyRaw = body?.quantity;
  const quantity = typeof qtyRaw === 'number' && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

  if (!materialId) {
    return NextResponse.json(
      { success: false, message: 'materialId is required.' },
      { status: 400 }
    );
  }
  if (!province) {
    return NextResponse.json(
      { success: false, message: 'A valid Iraq province is required.' },
      { status: 400 }
    );
  }

  const material = await prisma.privateCompanyMaterial.findFirst({
    where: { id: materialId, companyId: guard.companyId },
    select: { id: true, tracking: true, name: true },
  });
  if (!material) {
    return NextResponse.json(
      { success: false, message: 'Material not found.' },
      { status: 404 }
    );
  }

  // Build the list of serial numbers we will attempt to insert. For SERIAL
  // tracking we expect one or more explicit serials. For BULK tracking we
  // accept a single lot/SKU code (or auto-generate one).
  let serials: string[] = [];
  if (Array.isArray(body?.serialNumbers)) {
    serials = body.serialNumbers
      .map((s: unknown) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s: string) => s.length > 0);
  } else if (typeof body?.serialNumber === 'string' && body.serialNumber.trim()) {
    serials = [body.serialNumber.trim()];
  }
  if (material.tracking === 'SERIAL' && serials.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message:
          'At least one serial number is required for a SERIAL-tracked material.',
      },
      { status: 400 }
    );
  }
  if (material.tracking === 'BULK' && serials.length === 0) {
    // Auto-generate a lot code so the row still has a unique identifier.
    serials = [`LOT-${Date.now().toString(36).toUpperCase()}`];
  }

  const created: Array<{ id: string }> = [];
  const duplicates: string[] = [];
  for (const sn of serials) {
    try {
      const row = await prisma.privateCompanyMaterialItem.create({
        data: {
          companyId: guard.companyId,
          materialId,
          serialNumber: sn,
          province,
          status: 'IN_WAREHOUSE',
          quantity: material.tracking === 'BULK' ? quantity : 1,
          notes,
          createdById: guard.requesterId,
        },
        select: { id: true },
      });
      created.push(row);
      await logMovement({
        companyId: guard.companyId,
        itemId: row.id,
        type: 'STOCKED',
        actorId: guard.requesterId,
        quantity: material.tracking === 'BULK' ? quantity : 1,
        note: `Stocked ${material.name} (${sn})`,
      });
    } catch (e: unknown) {
      if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
        duplicates.push(sn);
      } else {
        console.error('stock item:', e);
      }
    }
  }
  return NextResponse.json({
    success: created.length > 0,
    created: created.length,
    duplicates,
    items: created,
    message:
      duplicates.length > 0
        ? `Created ${created.length} item(s). Skipped ${duplicates.length} duplicate serial(s).`
        : `Stocked ${created.length} item(s).`,
  });
}

/**
 * PATCH /api/provisor-private-company/warehouse/items
 *
 * Update metadata of an existing item — serial number, province, notes, or
 * status. Status changes that affect ownership (ASSIGNED / USED / RETURNED)
 * should be performed via the dedicated action endpoints; this PATCH is for
 * administrative corrections only.
 */
export async function PATCH(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const item = await prisma.privateCompanyMaterialItem.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, status: true },
  });
  if (!item) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body?.serialNumber === 'string' && body.serialNumber.trim())
    data.serialNumber = body.serialNumber.trim();
  if (body?.province !== undefined) {
    const p = normalizeProvince(body.province);
    if (!p) {
      return NextResponse.json(
        { success: false, message: 'Province is invalid.' },
        { status: 400 }
      );
    }
    data.province = p;
  }
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }
  if (typeof body?.status === 'string') {
    const s = body.status.toUpperCase();
    if (VALID_STATUS.has(s)) data.status = s;
  }
  if (typeof body?.quantity === 'number' && body.quantity > 0) {
    data.quantity = Math.floor(body.quantity);
  }

  try {
    const updated = await prisma.privateCompanyMaterialItem.update({
      where: { id },
      data,
      include: ITEM_INCLUDE,
    });
    await logMovement({
      companyId: guard.companyId,
      itemId: id,
      type: 'ADJUSTED',
      actorId: guard.requesterId,
      note: typeof body?.note === 'string' ? body.note.trim() || null : null,
    });
    return NextResponse.json({ success: true, item: updated });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, message: 'Another item already uses that serial number.' },
        { status: 409 }
      );
    }
    console.error('PATCH /warehouse/items:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to update item.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/provisor-private-company/warehouse/items?id=...
 *
 * Retires an item. Items that have been used on a ticket cannot be deleted
 * because they are part of the audit trail — set status to RETIRED instead.
 */
export async function DELETE(req: NextRequest) {
  const guard = await warehouseGuard(req, { requireMutate: true });
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  if (!id) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const item = await prisma.privateCompanyMaterialItem.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, status: true, usedTicketId: true },
  });
  if (!item) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  if (item.usedTicketId) {
    // soft-retire instead of hard delete to preserve audit history
    await prisma.privateCompanyMaterialItem.update({
      where: { id },
      data: { status: 'RETIRED' },
    });
    await logMovement({
      companyId: guard.companyId,
      itemId: id,
      type: 'ADJUSTED',
      actorId: guard.requesterId,
      note: 'Retired (used on ticket — preserved for audit).',
    });
    return NextResponse.json({ success: true, retired: true });
  }
  await prisma.privateCompanyMaterialItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
