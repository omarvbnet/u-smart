import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ITEM_SELECT = {
  id: true,
  serialNumber: true,
  quantity: true,
  status: true,
  province: true,
  notes: true,
  usedAt: true,
  material: { select: { id: true, name: true, unit: true, color: true } },
  assignedTo: { select: { id: true, name: true, username: true, role: true } },
};

/**
 * GET /api/provisor-private-company/warehouse/ticket-material-summary?ticketId=...
 *
 * Used materials on the ticket, movement log rows tied to the ticket, and
 * aggregate damaged / lost quantities recorded against this ticket.
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const ticketId = new URL(req.url).searchParams.get('ticketId')?.trim() ?? '';
  if (!ticketId) {
    return NextResponse.json({ success: false, message: 'ticketId is required.' }, { status: 400 });
  }

  const ticket = await prisma.visitorRequest.findFirst({
    where: { id: ticketId, privateCompanyId: guard.companyId },
    select: { id: true, technique: true, siteName: true, province: true, status: true },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found in this workspace.' }, { status: 404 });
  }

  const usedItems = await prisma.privateCompanyMaterialItem.findMany({
    where: { companyId: guard.companyId, usedTicketId: ticketId, status: 'USED' },
    orderBy: { usedAt: 'desc' },
    select: ITEM_SELECT,
  });

  const movements = await prisma.privateCompanyMaterialMovement.findMany({
    where: { companyId: guard.companyId, ticketId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      item: {
        select: {
          id: true,
          serialNumber: true,
          material: { select: { id: true, name: true, color: true } },
        },
      },
      actor: { select: { id: true, name: true, username: true } },
      fromStaff: { select: { id: true, name: true, username: true } },
      toStaff: { select: { id: true, name: true, username: true } },
    },
  });

  const dmg = await prisma.privateCompanyMaterialMovement.aggregate({
    where: { companyId: guard.companyId, ticketId, type: 'DAMAGED' },
    _sum: { quantity: true },
  });
  const lost = await prisma.privateCompanyMaterialMovement.aggregate({
    where: { companyId: guard.companyId, ticketId, type: 'LOST' },
    _sum: { quantity: true },
  });
  const returned = await prisma.privateCompanyMaterialMovement.aggregate({
    where: { companyId: guard.companyId, ticketId, type: 'RETURNED' },
    _sum: { quantity: true },
  });
  const usedMov = await prisma.privateCompanyMaterialMovement.aggregate({
    where: { companyId: guard.companyId, ticketId, type: 'USED' },
    _sum: { quantity: true },
  });

  const usedUnits = usedItems.reduce((s: number, it: { quantity?: number }) => s + (it.quantity ?? 1), 0);

  return NextResponse.json({
    success: true,
    ticket,
    usedItems,
    movements,
    totals: {
      usedItemRows: usedItems.length,
      usedUnits,
      damagedUnits: Math.floor(Number(dmg._sum?.quantity ?? 0) || 0),
      lostUnits: Math.floor(Number(lost._sum?.quantity ?? 0) || 0),
      returnedUnits: Math.floor(Number(returned._sum?.quantity ?? 0) || 0),
      usedMovementUnits: Math.floor(Number(usedMov._sum?.quantity ?? 0) || 0),
    },
  });
}
