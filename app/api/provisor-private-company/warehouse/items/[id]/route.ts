import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  CAN_USE_MATERIALS_ON_TICKET_ROLES,
  logMovement,
  warehouseGuard,
} from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

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
  movements: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: {
      actor: { select: { id: true, name: true, username: true } },
      fromStaff: { select: { id: true, name: true, username: true } },
      toStaff: { select: { id: true, name: true, username: true } },
      ticket: { select: { id: true, technique: true, siteName: true } },
    },
  },
};

async function idsWarehouseKeepers(companyId: string): Promise<string[]> {
  const rows: Array<{ id: string }> = await prisma.ticketRequester.findMany({
    where: {
      privateCompanyId: companyId,
      role: 'WAREHOUSE_KEEPER',
      status: { not: 'BLOCKED' },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function notifyMaterialAssigned(args: {
  requesterId: string;
  companyId: string;
  itemId: string;
  materialName: string;
  serialNumber: string;
  province: string;
}) {
  try {
    await notifyRequesterI18n({
      prisma,
      type: 'material_assigned',
      requesterId: args.requesterId,
      payload: {
        key: 'material_assigned',
        vars: {
          materialName: args.materialName,
          serialNumber: args.serialNumber,
          province: args.province,
        },
      },
      data: {
        scope: 'private_company',
        companyId: args.companyId,
        itemId: args.itemId,
      },
    });
  } catch (e) {
    console.error('notifyMaterialAssigned:', e);
  }
}

async function notifyMaterialUsedForRecipients(args: {
  companyId: string;
  itemId: string;
  materialName: string;
  serialNumber: string;
  ticketLabel: string;
  /** Previous holder before consumption */
  previousHolderId: string | null;
  /** Do not notify this requester (usually the actor) */
  excludeId?: string;
}) {
  const keeperIds = await idsWarehouseKeepers(args.companyId);
  const targets = new Set<string>(keeperIds);
  if (args.previousHolderId) targets.add(args.previousHolderId);
  if (args.excludeId) targets.delete(args.excludeId);

  const vars = {
    materialName: args.materialName,
    serialNumber: args.serialNumber,
    ticketLabel: args.ticketLabel,
  };
  for (const requesterId of targets) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'material_used',
        requesterId,
        payload: { key: 'material_used', vars },
        data: {
          scope: 'private_company',
          companyId: args.companyId,
          itemId: args.itemId,
        },
      });
    } catch (e) {
      console.error('notifyMaterialUsedForRecipients:', requesterId, e);
    }
  }
}

/** GET — full detail of a single item including its movement log. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const item = await prisma.privateCompanyMaterialItem.findFirst({
    where: { id, companyId: guard.companyId },
    include: ITEM_INCLUDE,
  });
  if (!item) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  if (
    !guard.canViewAllWarehouseInventory &&
    item.assignedToId !== guard.requesterId
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  const inventoryScope = guard.canViewAllWarehouseInventory ? 'all' : 'assigned';
  return NextResponse.json({ success: true, inventoryScope, item });
}

type Action = 'assign' | 'transfer' | 'return' | 'use' | 'damage' | 'lose';

/**
 * POST /api/provisor-private-company/warehouse/items/:id
 *
 * Body:
 *   { action: 'assign' | 'transfer' | 'return' | 'use' | 'damage' | 'lose',
 *     toStaffId?: string,           // for assign/transfer
 *     ticketId?: string,            // for use
 *     note?: string,                // optional note recorded in the movement
 *     quantity?: number,            // BULK only — defaults to 1
 *   }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '').toLowerCase() as Action;
  if (!['assign', 'transfer', 'return', 'use', 'damage', 'lose'].includes(action)) {
    return NextResponse.json(
      { success: false, message: 'Unknown action.' },
      { status: 400 }
    );
  }
  const note = typeof body?.note === 'string' ? body.note.trim() || null : null;
  const quantity =
    typeof body?.quantity === 'number' && body.quantity > 0
      ? Math.floor(body.quantity)
      : undefined;

  const item = await prisma.privateCompanyMaterialItem.findFirst({
    where: { id, companyId: guard.companyId },
    include: { material: { select: { id: true, name: true, tracking: true } } },
  });
  if (!item) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });

  if (
    (action === 'assign' || action === 'transfer' || action === 'damage' || action === 'lose') &&
    !guard.canMutateWarehouse
  ) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner or a warehouse keeper can perform this action.',
      },
      { status: 403 }
    );
  }
  if (action === 'return') {
    if (!guard.canMutateWarehouse && item.assignedToId !== guard.requesterId) {
      return NextResponse.json(
        { success: false, message: 'You can only return items assigned to you.' },
        { status: 403 }
      );
    }
  }
  if (action === 'use') {
    if (!CAN_USE_MATERIALS_ON_TICKET_ROLES.has(guard.actorRole)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your role cannot record material consumption on tickets.',
        },
        { status: 403 }
      );
    }
    if (!guard.canMutateWarehouse && item.assignedToId !== guard.requesterId) {
      return NextResponse.json(
        { success: false, message: 'You can only use items currently assigned to you.' },
        { status: 403 }
      );
    }
  }

  switch (action) {
    case 'assign':
    case 'transfer': {
      const toStaffId = typeof body?.toStaffId === 'string' ? body.toStaffId.trim() : '';
      if (!toStaffId) {
        return NextResponse.json(
          { success: false, message: 'toStaffId is required.' },
          { status: 400 }
        );
      }
      const recipient = await prisma.ticketRequester.findFirst({
        where: { id: toStaffId, privateCompanyId: guard.companyId },
        select: { id: true },
      });
      if (!recipient) {
        return NextResponse.json(
          { success: false, message: 'Recipient is not a member of this workspace.' },
          { status: 400 }
        );
      }
      if (item.status === 'USED' || item.status === 'RETIRED' || item.status === 'LOST') {
        return NextResponse.json(
          { success: false, message: `Item is ${item.status} and cannot be reassigned.` },
          { status: 409 }
        );
      }
      const fromStaffId = item.assignedToId;
      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: { assignedToId: toStaffId, status: 'ASSIGNED' },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: action === 'transfer' ? 'TRANSFERRED' : 'ASSIGNED',
        fromStaffId,
        toStaffId,
        actorId: guard.requesterId,
        quantity,
        note,
      });
      const matName = updated.material?.name ?? item.material.name;
      await notifyMaterialAssigned({
        requesterId: toStaffId,
        companyId: guard.companyId,
        itemId: id,
        materialName: matName,
        serialNumber: updated.serialNumber,
        province: updated.province,
      });
      return NextResponse.json({ success: true, item: updated });
    }
    case 'return': {
      const fromStaffId = item.assignedToId;
      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: { assignedToId: null, status: 'IN_WAREHOUSE' },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: 'RETURNED',
        fromStaffId,
        toStaffId: null,
        actorId: guard.requesterId,
        quantity,
        note,
      });
      return NextResponse.json({ success: true, item: updated });
    }
    case 'use': {
      const ticketId = typeof body?.ticketId === 'string' ? body.ticketId.trim() : '';
      if (!ticketId) {
        return NextResponse.json(
          { success: false, message: 'ticketId is required.' },
          { status: 400 }
        );
      }
      const ticket = await prisma.visitorRequest.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          privateCompanyId: true,
          requesterId: true,
          status: true,
          siteName: true,
          technique: true,
        },
      });
      if (!ticket) {
        return NextResponse.json(
          { success: false, message: 'Ticket not found.' },
          { status: 404 }
        );
      }
      if (ticket.privateCompanyId && ticket.privateCompanyId !== guard.companyId) {
        return NextResponse.json(
          { success: false, message: 'This ticket belongs to a different workspace.' },
          { status: 403 }
        );
      }
      const previousHolderId = item.assignedToId;
      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: {
          status: 'USED',
          usedTicketId: ticketId,
          usedAt: new Date(),
        },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: 'USED',
        fromStaffId: previousHolderId,
        ticketId,
        actorId: guard.requesterId,
        quantity,
        note,
      });
      const ticketLabel =
        [ticket.siteName, ticket.technique].filter(Boolean).join(' · ') || ticket.id;
      const matName = updated.material?.name ?? item.material.name;
      await notifyMaterialUsedForRecipients({
        companyId: guard.companyId,
        itemId: id,
        materialName: matName,
        serialNumber: updated.serialNumber,
        ticketLabel,
        previousHolderId,
        excludeId: guard.requesterId,
      });
      return NextResponse.json({ success: true, item: updated });
    }
    case 'damage':
    case 'lose': {
      const nextStatus = action === 'damage' ? 'DAMAGED' : 'LOST';
      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: { status: nextStatus, assignedToId: null },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: action === 'damage' ? 'DAMAGED' : 'LOST',
        fromStaffId: item.assignedToId,
        actorId: guard.requesterId,
        quantity,
        note,
      });
      return NextResponse.json({ success: true, item: updated });
    }
  }
}
