import { randomBytes } from 'node:crypto';
import { prisma as _prisma } from '@/lib/prisma';
import {
  formatQuantityWithUnit,
  materialSupportsPartialConsumption,
} from '@/lib/material-quantity';
import { logMovement } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type MaterialMeta = {
  id: string;
  name: string;
  tracking: string;
  unit: string | null;
};

type LineRow = {
  id: string;
  companyId: string;
  materialId: string;
  serialNumber: string;
  quantity: number;
  status: string;
  assignedToId: string | null;
  province: string;
  notes: string | null;
  handoverConfirmedAt: Date | null;
  returnRequestedAt: Date | null;
  material: MaterialMeta;
};

async function uniqueSplitSerial(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  companyId: string,
  baseSerial: string
): Promise<string> {
  for (let n = 0; n < 8; n++) {
    const suffix = randomBytes(3).toString('hex');
    const sn = `${baseSerial}#${suffix}`;
    const clash = await tx.privateCompanyMaterialItem.findFirst({
      where: { companyId, serialNumber: sn },
      select: { id: true },
    });
    if (!clash) return sn;
  }
  return `${baseSerial}#${randomBytes(8).toString('hex')}`;
}

/**
 * Consume [consumeQty] from one assigned line (partial or full). Returns the row
 * that represents the consumption (existing line if full use, new USED row if partial).
 */
export async function consumeQuantityFromItemLine(args: {
  companyId: string;
  itemId: string;
  ticketId: string;
  consumeQty: number;
  actorId: string;
  note: string | null;
  ticketSiteLabel: string;
}): Promise<
  | { ok: true; consumedQty: number; usedItemId: string; remainingOnLine: number }
  | { ok: false; message: string; status: number }
> {
  const item = (await prisma.privateCompanyMaterialItem.findFirst({
    where: { id: args.itemId, companyId: args.companyId },
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
      handoverConfirmedAt: true,
      returnRequestedAt: true,
      material: { select: { id: true, name: true, tracking: true, unit: true } },
    },
  })) as LineRow | null;

  if (!item) return { ok: false, message: 'Not found.', status: 404 };
  if (item.status !== 'ASSIGNED') {
    return { ok: false, message: 'Only assigned stock can be recorded on a ticket.', status: 409 };
  }
  if (!item.handoverConfirmedAt) {
    return {
      ok: false,
      message: 'Confirm receipt of this material before recording use on a ticket.',
      status: 409,
    };
  }
  if (item.returnRequestedAt) {
    return {
      ok: false,
      message: 'Resolve the pending return request before using this material.',
      status: 409,
    };
  }

  const lineQty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
  const consumeQty = Math.floor(args.consumeQty);
  if (consumeQty < 1) {
    return { ok: false, message: 'quantity must be at least 1.', status: 400 };
  }
  if (consumeQty > lineQty) {
    return {
      ok: false,
      message: `Only ${formatQuantityWithUnit(lineQty, item.material.unit)} available on this line.`,
      status: 409,
    };
  }

  const partialOk = materialSupportsPartialConsumption({
    tracking: item.material.tracking,
    unit: item.material.unit,
  });
  if (consumeQty < lineQty && !partialOk) {
    return {
      ok: false,
      message:
        'This material is tracked per unit (not by length). Use the full line or assign BULK / meter-based catalog entries for partial use.',
      status: 400,
    };
  }

  const unitLabel = item.material.unit?.trim() || 'units';
  const sitePart = args.ticketSiteLabel ? `Site: ${args.ticketSiteLabel}` : '';
  const balanceNote = `Used ${consumeQty} ${unitLabel} on ticket${sitePart ? ` · ${sitePart}` : ''}`;
  const movementNote = [balanceNote, args.note].filter(Boolean).join(' | ');
  const fromStaffId = item.assignedToId;

  if (consumeQty === lineQty) {
    const updated = await prisma.privateCompanyMaterialItem.update({
      where: { id: args.itemId },
      data: {
        status: 'USED',
        usedTicketId: args.ticketId,
        usedAt: new Date(),
      },
    });
    await logMovement({
      companyId: args.companyId,
      itemId: updated.id,
      type: 'USED',
      fromStaffId,
      ticketId: args.ticketId,
      actorId: args.actorId,
      quantity: consumeQty,
      note: movementNote,
    });
    return {
      ok: true,
      consumedQty: consumeQty,
      usedItemId: updated.id,
      remainingOnLine: 0,
    };
  }

  const usedRow = await prisma.$transaction(async (tx: any) => {
    await tx.privateCompanyMaterialItem.update({
      where: { id: args.itemId },
      data: { quantity: lineQty - consumeQty },
    });
    const newSerial = await uniqueSplitSerial(tx, args.companyId, item.serialNumber);
    const created = await tx.privateCompanyMaterialItem.create({
      data: {
        companyId: item.companyId,
        materialId: item.materialId,
        serialNumber: newSerial,
        province: item.province,
        status: 'USED',
        quantity: consumeQty,
        notes: item.notes ?? null,
        assignedToId: fromStaffId,
        usedTicketId: args.ticketId,
        usedAt: new Date(),
        createdById: args.actorId,
      },
    });
    await logMovement({
      companyId: args.companyId,
      itemId: created.id,
      type: 'USED',
      fromStaffId,
      ticketId: args.ticketId,
      actorId: args.actorId,
      quantity: consumeQty,
      note: `${movementNote} · Remaining on line ${item.serialNumber}: ${lineQty - consumeQty} ${unitLabel}`,
      tx,
    });
    return created;
  });

  return {
    ok: true,
    consumedQty: consumeQty,
    usedItemId: usedRow.id,
    remainingOnLine: lineQty - consumeQty,
  };
}

/**
 * Consume quantity across all assigned, receipt-confirmed lines for one catalog
 * material (FIFO). Example: 4 × 1000 m lines → 4000 m pool.
 */
export async function consumeQuantityFromStaffMaterialPool(args: {
  companyId: string;
  staffId: string;
  materialId: string;
  ticketId: string;
  consumeQty: number;
  actorId: string;
  note: string | null;
  ticketSiteLabel: string;
}): Promise<
  | {
      ok: true;
      consumedQty: number;
      remainingHeld: number;
      usedItemIds: string[];
    }
  | { ok: false; message: string; status: number }
> {
  const consumeQty = Math.floor(args.consumeQty);
  if (consumeQty < 1) {
    return { ok: false, message: 'quantity must be at least 1.', status: 400 };
  }

  const lines = (await prisma.privateCompanyMaterialItem.findMany({
    where: {
      companyId: args.companyId,
      materialId: args.materialId,
      assignedToId: args.staffId,
      status: 'ASSIGNED',
      handoverConfirmedAt: { not: null },
      returnRequestedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quantity: true,
      serialNumber: true,
      material: { select: { id: true, name: true, tracking: true, unit: true } },
    },
  })) as Array<{
    id: string;
    quantity: number;
    serialNumber: string;
    material: MaterialMeta;
  }>;

  if (lines.length === 0) {
    return {
      ok: false,
      message: 'You have no confirmed assigned stock for this material.',
      status: 409,
    };
  }

  const material = lines[0]!.material;
  const partialOk = materialSupportsPartialConsumption({
    tracking: material.tracking,
    unit: material.unit,
  });
  if (!partialOk && consumeQty !== 1) {
    return {
      ok: false,
      message: 'Enter use quantity 1 for per-unit materials, or use a BULK / meter-based catalog item.',
      status: 400,
    };
  }

  const totalHeld = lines.reduce(
    (s, l) => s + Math.max(1, Math.floor(Number(l.quantity)) || 1),
    0
  );
  if (consumeQty > totalHeld) {
    return {
      ok: false,
      message: `You only hold ${formatQuantityWithUnit(totalHeld, material.unit)} of ${material.name} (${lines.length} line(s)).`,
      status: 409,
    };
  }

  let remaining = consumeQty;
  const usedItemIds: string[] = [];
  for (const line of lines) {
    if (remaining <= 0) break;
    const lineQty = Math.max(1, Math.floor(Number(line.quantity)) || 1);
    const take = Math.min(lineQty, remaining);
    const res = await consumeQuantityFromItemLine({
      companyId: args.companyId,
      itemId: line.id,
      ticketId: args.ticketId,
      consumeQty: take,
      actorId: args.actorId,
      note: args.note,
      ticketSiteLabel: args.ticketSiteLabel,
    });
    if (!res.ok) return res;
    usedItemIds.push(res.usedItemId);
    remaining -= res.consumedQty;
  }

  const remainingHeld = totalHeld - consumeQty;

  return {
    ok: true,
    consumedQty: consumeQty,
    remainingHeld,
    usedItemIds,
  };
}
