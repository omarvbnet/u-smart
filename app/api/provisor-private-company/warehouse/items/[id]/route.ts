import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  CAN_USE_MATERIALS_ON_TICKET_ROLES,
  logMovement,
  warehouseGuard,
} from '@/lib/private-company-warehouse';
import { remainingAssignBudgetForStaffMaterial } from '@/lib/private-company-staff-budget-access';

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
  handoverConfirmedBy: {
    select: { id: true, name: true, username: true, role: true },
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

type Action =
  | 'assign'
  | 'transfer'
  | 'return'
  | 'use'
  | 'damage'
  | 'lose'
  | 'confirm-handover';

/**
 * POST /api/provisor-private-company/warehouse/items/:id
 *
 * Body:
 *   { action: 'assign' | 'transfer' | 'return' | 'use' | 'damage' | 'lose' | 'confirm-handover',
 *     toStaffId?: string,           // for assign/transfer
 *     ticketId?: string,            // for use; optional for damage/lose (audit on ticket)
 *     note?: string,                // optional note recorded in the movement
 *     quantity?: number,            // How many units this action moves (defaults to full line).
 *                                   If less than the line quantity for assign/transfer, the line
 *                                   is split: remainder stays on the source row, a new row holds
 *                                   the amount going to the recipient.
 *     returnCondition?: 'new_good' | 'used' | 'damaged'  // for return: new_good/used → IN_WAREHOUSE; damaged → DAMAGED
 *   }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '').toLowerCase() as Action;
  if (
    !['assign', 'transfer', 'return', 'use', 'damage', 'lose', 'confirm-handover'].includes(action)
  ) {
    return NextResponse.json(
      { success: false, message: 'Unknown action.' },
      { status: 400 }
    );
  }
  const note = typeof body?.note === 'string' ? body.note.trim() || null : null;
  const returnConditionRaw = String(body?.returnCondition ?? 'new_good').toLowerCase();
  const bodyQuantity =
    typeof body?.quantity === 'number' && body.quantity > 0
      ? Math.floor(body.quantity)
      : undefined;

  const item = await prisma.privateCompanyMaterialItem.findFirst({
    where: { id, companyId: guard.companyId },
    select: {
      id: true,
      companyId: true,
      materialId: true,
      status: true,
      quantity: true,
      assignedToId: true,
      province: true,
      notes: true,
      serialNumber: true,
      usedTicketId: true,
      handoverConfirmedAt: true,
      material: { select: { id: true, name: true, tracking: true } },
    },
  });
  if (!item) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });

  /** Field staff may report their own assigned stock damaged/lost (same role gate as ticket use). */
  const staffSelfDamageOrLoss =
    (action === 'damage' || action === 'lose') &&
    !guard.canMutateWarehouse &&
    item.status === 'ASSIGNED' &&
    item.assignedToId === guard.requesterId &&
    CAN_USE_MATERIALS_ON_TICKET_ROLES.has(guard.actorRole);

  if (
    (action === 'assign' ||
      action === 'transfer' ||
      action === 'damage' ||
      action === 'lose') &&
    !guard.canMutateWarehouse &&
    !staffSelfDamageOrLoss
  ) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner or a warehouse keeper can perform this action.',
      },
      { status: 403 }
    );
  }

  const assigneeSelfConfirmHandover =
    action === 'confirm-handover' &&
    item.status === 'ASSIGNED' &&
    item.assignedToId === guard.requesterId &&
    !item.handoverConfirmedAt;

  if (action === 'confirm-handover' && !guard.canMutateWarehouse && !assigneeSelfConfirmHandover) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Only the assignee (you, if this unit is assigned to you) or a warehouse keeper can confirm physical receipt.',
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

  if (action === 'confirm-handover') {
    if (item.status !== 'ASSIGNED' || !item.assignedToId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Only items assigned to field staff can be confirmed as physically received.',
        },
        { status: 409 }
      );
    }
    if (item.handoverConfirmedAt) {
      return NextResponse.json(
        { success: false, message: 'This assignment was already confirmed.' },
        { status: 409 }
      );
    }
    const updated = await prisma.privateCompanyMaterialItem.update({
      where: { id },
      data: {
        handoverConfirmedAt: new Date(),
        handoverConfirmedById: guard.requesterId,
      },
      include: ITEM_INCLUDE,
    });
    await logMovement({
      companyId: guard.companyId,
      itemId: id,
      type: 'HANDOVER_CONFIRMED',
      toStaffId: item.assignedToId,
      actorId: guard.requesterId,
      quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
      note,
    });
    return NextResponse.json({ success: true, item: updated });
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
      const lineQty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
      const requested = bodyQuantity !== undefined ? bodyQuantity : lineQty;
      const moveQty = Math.min(Math.max(requested, 1), lineQty);
      if (moveQty < 1 || moveQty > lineQty) {
        return NextResponse.json(
          { success: false, message: 'Invalid quantity for this line.' },
          { status: 400 }
        );
      }

      const rem = await remainingAssignBudgetForStaffMaterial({
        companyId: guard.companyId,
        staffId: toStaffId,
        materialId: item.materialId,
      });
      if (!rem.unlimited && rem.remaining < moveQty) {
        return NextResponse.json(
          {
            success: false,
            message: `This assignment exceeds the recipient's budget for "${item.material.name}": cap ${rem.cap}, already assigned ${rem.assigned} units, requested ${moveQty}.`,
          },
          { status: 409 }
        );
      }

      const companyId = guard.companyId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function uniqueSplitSerial(tx: any): Promise<string> {
        for (let n = 0; n < 8; n++) {
          const suffix = randomBytes(3).toString('hex');
          const sn = `${item.serialNumber}#${suffix}`;
          const clash = await tx.privateCompanyMaterialItem.findFirst({
            where: { companyId, serialNumber: sn },
            select: { id: true },
          });
          if (!clash) return sn;
        }
        return `${item.serialNumber}#${randomBytes(8).toString('hex')}`;
      }

      if (moveQty === lineQty) {
        const updated = await prisma.privateCompanyMaterialItem.update({
          where: { id },
          data: {
            assignedToId: toStaffId,
            status: 'ASSIGNED',
            handoverConfirmedAt: null,
            handoverConfirmedById: null,
          },
          include: ITEM_INCLUDE,
        });
        await logMovement({
          companyId: guard.companyId,
          itemId: id,
          type: action === 'transfer' ? 'TRANSFERRED' : 'ASSIGNED',
          fromStaffId,
          toStaffId,
          actorId: guard.requesterId,
          quantity: moveQty,
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

      const resultItem = await prisma.$transaction(async (tx: any) => {
        await tx.privateCompanyMaterialItem.update({
          where: { id },
          data: { quantity: lineQty - moveQty },
        });
        const newSerial = await uniqueSplitSerial(tx);
        const created = await tx.privateCompanyMaterialItem.create({
          data: {
            companyId: item.companyId,
            materialId: item.materialId,
            serialNumber: newSerial,
            province: item.province,
            status: 'ASSIGNED',
            quantity: moveQty,
            notes: item.notes ?? null,
            assignedToId: toStaffId,
            createdById: guard.requesterId,
            handoverConfirmedAt: null,
            handoverConfirmedById: null,
          },
          include: ITEM_INCLUDE,
        });
        await logMovement({
          companyId: guard.companyId,
          itemId: created.id,
          type: action === 'transfer' ? 'TRANSFERRED' : 'ASSIGNED',
          fromStaffId,
          toStaffId,
          actorId: guard.requesterId,
          quantity: moveQty,
          note,
          tx,
        });
        return created;
      });

      const matName = resultItem.material?.name ?? item.material.name;
      await notifyMaterialAssigned({
        requesterId: toStaffId,
        companyId: guard.companyId,
        itemId: resultItem.id,
        materialName: matName,
        serialNumber: resultItem.serialNumber,
        province: resultItem.province,
      });
      return NextResponse.json({
        success: true,
        item: resultItem,
        splitFromItemId: id,
        remainderQuantity: lineQty - moveQty,
      });
    }
    case 'return': {
      const fromStaffId = item.assignedToId;
      const lineQty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
      const moveQty =
        bodyQuantity !== undefined ? Math.min(Math.max(bodyQuantity, 1), lineQty) : lineQty;
      const rc =
        returnConditionRaw === 'damaged' || returnConditionRaw === 'damage'
          ? 'damaged'
          : returnConditionRaw === 'used'
            ? 'used'
            : 'new_good';
      const extra =
        rc === 'used'
          ? 'Return: used (still serviceable).'
          : rc === 'damaged'
            ? 'Return: damaged.'
            : 'Return: new / unused.';
      const movementNote = [extra, note].filter(Boolean).join(' | ');

      if (rc === 'damaged') {
        const updated = await prisma.privateCompanyMaterialItem.update({
          where: { id },
          data: {
            assignedToId: null,
            status: 'DAMAGED',
            handoverConfirmedAt: null,
            handoverConfirmedById: null,
          },
          include: ITEM_INCLUDE,
        });
        await logMovement({
          companyId: guard.companyId,
          itemId: id,
          type: 'DAMAGED',
          fromStaffId,
          toStaffId: null,
          actorId: guard.requesterId,
          quantity: moveQty,
          note: movementNote,
        });
        return NextResponse.json({ success: true, item: updated });
      }

      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: {
          assignedToId: null,
          status: 'IN_WAREHOUSE',
          handoverConfirmedAt: null,
          handoverConfirmedById: null,
        },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: 'RETURNED',
        fromStaffId,
        toStaffId: null,
        actorId: guard.requesterId,
        quantity: moveQty,
        note: movementNote,
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
        quantity: bodyQuantity,
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
      if (item.status === 'USED' || item.status === 'RETIRED' || item.status === 'LOST') {
        return NextResponse.json(
          { success: false, message: `Item is ${item.status} and cannot be updated this way.` },
          { status: 409 }
        );
      }
      if (action === 'damage' && item.status === 'DAMAGED') {
        return NextResponse.json(
          { success: false, message: 'Item is already marked damaged.' },
          { status: 409 }
        );
      }
      let ticketIdForLog: string | null = null;
      const ticketIdRaw = typeof body?.ticketId === 'string' ? body.ticketId.trim() : '';
      if (ticketIdRaw) {
        const t = await prisma.visitorRequest.findFirst({
          where: { id: ticketIdRaw, privateCompanyId: guard.companyId },
          select: { id: true },
        });
        if (!t) {
          return NextResponse.json(
            { success: false, message: 'ticketId not found in this workspace.' },
            { status: 400 }
          );
        }
        ticketIdForLog = ticketIdRaw;
      }
      const nextStatus = action === 'damage' ? 'DAMAGED' : 'LOST';
      const updated = await prisma.privateCompanyMaterialItem.update({
        where: { id },
        data: {
          status: nextStatus,
          assignedToId: null,
          handoverConfirmedAt: null,
          handoverConfirmedById: null,
        },
        include: ITEM_INCLUDE,
      });
      await logMovement({
        companyId: guard.companyId,
        itemId: id,
        type: action === 'damage' ? 'DAMAGED' : 'LOST',
        fromStaffId: item.assignedToId,
        ticketId: ticketIdForLog,
        actorId: guard.requesterId,
        quantity: bodyQuantity,
        note,
      });
      return NextResponse.json({ success: true, item: updated });
    }
  }
}
