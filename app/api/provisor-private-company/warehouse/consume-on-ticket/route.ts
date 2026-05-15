import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  CAN_USE_MATERIALS_ON_TICKET_ROLES,
  warehouseGuard,
} from '@/lib/private-company-warehouse';
import { consumeQuantityFromStaffMaterialPool } from '@/lib/private-company-material-consume';
import { formatQuantityWithUnit } from '@/lib/material-quantity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * POST /api/provisor-private-company/warehouse/consume-on-ticket
 *
 * Record use of a catalog material on a ticket, deducting quantity FIFO across
 * all assigned lines the caller holds (e.g. 4 × 1000 m → 4000 m pool).
 *
 * Body: { materialId, ticketId, quantity, useReason?, note? }
 */
export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  if (!CAN_USE_MATERIALS_ON_TICKET_ROLES.has(guard.actorRole) && !guard.isOwner) {
    return NextResponse.json(
      { success: false, message: 'Your role cannot record material consumption on tickets.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const materialId = typeof body?.materialId === 'string' ? body.materialId.trim() : '';
  const ticketId = typeof body?.ticketId === 'string' ? body.ticketId.trim() : '';
  const quantity =
    typeof body?.quantity === 'number' && body.quantity > 0
      ? Math.floor(body.quantity)
      : 0;
  const freeNote = typeof body?.note === 'string' ? body.note.trim() : '';
  const useReasonRaw = typeof body?.useReason === 'string' ? body.useReason.trim() : '';

  if (!materialId || !ticketId || quantity < 1) {
    return NextResponse.json(
      { success: false, message: 'materialId, ticketId, and quantity (≥ 1) are required.' },
      { status: 400 }
    );
  }

  const material = await prisma.privateCompanyMaterial.findFirst({
    where: { id: materialId, companyId: guard.companyId },
    select: { id: true, name: true, unit: true },
  });
  if (!material) {
    return NextResponse.json({ success: false, message: 'Material not found.' }, { status: 404 });
  }

  const ticket = await prisma.visitorRequest.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      privateCompanyId: true,
      siteName: true,
      technique: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }
  if (ticket.privateCompanyId && ticket.privateCompanyId !== guard.companyId) {
    return NextResponse.json(
      { success: false, message: 'This ticket belongs to a different workspace.' },
      { status: 403 }
    );
  }

  const comp = await prisma.privateCompany.findUnique({
    where: { id: guard.companyId },
    select: { materialUseReasons: true },
  });
  const allowed = Array.isArray(comp?.materialUseReasons)
    ? (comp.materialUseReasons as string[]).map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (allowed.length > 0 && (!useReasonRaw || !allowed.includes(useReasonRaw))) {
    return NextResponse.json(
      {
        success: false,
        message: 'Select a material reason from the workspace list.',
      },
      { status: 400 }
    );
  }

  const noteParts: string[] = [];
  if (useReasonRaw) noteParts.push(`Reason: ${useReasonRaw}`);
  if (freeNote) noteParts.push(freeNote);
  const note = noteParts.length ? noteParts.join(' | ') : null;

  const ticketLabel =
    [ticket.siteName, ticket.technique].filter(Boolean).join(' · ') || ticket.id;

  const result = await consumeQuantityFromStaffMaterialPool({
    companyId: guard.companyId,
    staffId: guard.requesterId,
    materialId,
    ticketId,
    consumeQty: quantity,
    actorId: guard.requesterId,
    note,
    ticketSiteLabel: ticketLabel,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: result.message },
      { status: result.status }
    );
  }

  return NextResponse.json({
    success: true,
    materialId,
    materialName: material.name,
    ticketId,
    consumedQty: result.consumedQty,
    remainingHeld: result.remainingHeld,
    remainingHeldLabel: formatQuantityWithUnit(result.remainingHeld, material.unit),
    usedItemIds: result.usedItemIds,
    message: `Recorded ${formatQuantityWithUnit(result.consumedQty, material.unit)} on this ticket. You still hold ${formatQuantityWithUnit(result.remainingHeld, material.unit)}.`,
  });
}
