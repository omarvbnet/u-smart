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
]);

/**
 * GET /api/provisor-private-company/warehouse/activity
 *
 * Paginated movement log (full audit trail for every workspace member).
 * Supports filtering by type,
 * itemId, and ticketId.
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = { companyId: guard.companyId };

  const type = searchParams.get('type');
  if (type && VALID_TYPES.has(type)) where.type = type;
  const itemId = searchParams.get('itemId');
  if (itemId) where.itemId = itemId;
  const ticketId = searchParams.get('ticketId');
  if (ticketId) where.ticketId = ticketId;

  const limit = Math.max(
    1,
    Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50)
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
  return NextResponse.json({ success: true, movements });
}
