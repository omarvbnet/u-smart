import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const VALID_TYPES = new Set([
  'STOCKED',
  'ASSIGNED',
  'RETURNED',
  'USED',
  'TRANSFERRED',
  'DAMAGED',
  'LOST',
  'ADJUSTED',
  'HANDOVER_CONFIRMED',
  'HANDOVER_REJECTED',
  'RETURN_REQUESTED',
  'RETURN_REJECTED',
]);

/**
 * GET /api/provisor-private-company/warehouse/activity
 *
 * Paginated movement log. Full-view roles see the workspace audit trail;
 * field roles see movements on their assigned items and rows where they
 * appear as actor / from / to staff.
 *
 * Query: ?limit= (max 250 for full-inventory roles, 100 for field staff; default 50)
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const companyId = guard.companyId;
  const inventoryScope = guard.canViewAllWarehouseInventory ? 'all' : 'assigned';

  const clauses: Array<Record<string, unknown>> = [{ companyId }];
  if (!guard.canViewAllWarehouseInventory) {
    clauses.push({
      OR: [
        { item: { assignedToId: guard.requesterId } },
        { fromStaffId: guard.requesterId },
        { toStaffId: guard.requesterId },
        { actorId: guard.requesterId },
      ],
    });
  }

  const type = searchParams.get('type');
  if (type && VALID_TYPES.has(type)) clauses.push({ type });
  const itemId = searchParams.get('itemId');
  if (itemId) clauses.push({ itemId });
  const ticketId = searchParams.get('ticketId');
  if (ticketId) clauses.push({ ticketId });

  const where =
    clauses.length === 1 ? clauses[0]! : { AND: clauses };

  const limit = Math.max(
    1,
    Math.min(
      guard.canViewAllWarehouseInventory ? 250 : 100,
      parseInt(searchParams.get('limit') ?? '50', 10) || 50
    )
  );

  const movements = await prisma.privateCompanyMaterialMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      item: {
        select: {
          id: true,
          serialNumber: true,
          status: true,
          material: { select: { id: true, name: true, color: true } },
        },
      },
      actor: { select: { id: true, name: true, username: true } },
      fromStaff: { select: { id: true, name: true, username: true } },
      toStaff: { select: { id: true, name: true, username: true } },
      ticket: { select: { id: true, technique: true, siteName: true, province: true } },
    },
  });
  return NextResponse.json({ success: true, inventoryScope, movements });
}
