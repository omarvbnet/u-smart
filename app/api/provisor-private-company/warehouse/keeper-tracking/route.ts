import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ITEM_ASSIGNED_SELECT = {
  id: true,
  serialNumber: true,
  province: true,
  quantity: true,
  status: true,
  notes: true,
  usedAt: true,
  handoverConfirmedAt: true,
  updatedAt: true,
  material: { select: { id: true, name: true, unit: true, color: true, category: true } },
  assignedTo: {
    select: { id: true, name: true, username: true, role: true, province: true, phone: true },
  },
  handoverConfirmedBy: { select: { id: true, name: true, username: true } },
};

const ITEM_USED_SELECT = {
  id: true,
  serialNumber: true,
  province: true,
  quantity: true,
  usedAt: true,
  updatedAt: true,
  material: { select: { id: true, name: true, unit: true, color: true } },
  usedTicket: {
    select: {
      id: true,
      technique: true,
      siteName: true,
      province: true,
      status: true,
      createdAt: true,
    },
  },
};

/**
 * GET /api/provisor-private-company/warehouse/keeper-tracking
 *
 * Consolidated view for warehouse keepers (and other full-inventory roles):
 * per-material counts by status, all currently assigned units with holder,
 * recently consumed units with ticket + timestamps, and damage/loss rows
 * with movement notes (reason) and who reported.
 *
 * Requires full workspace inventory visibility (owner, manager, coordinator,
 * warehouse keeper).
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  if (!guard.canViewAllWarehouseInventory) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only roles with full warehouse visibility can use keeper tracking.',
      },
      { status: 403 }
    );
  }

  const companyId = guard.companyId;
  const { searchParams } = new URL(req.url);
  const assignedTake = Math.min(
    400,
    Math.max(20, parseInt(searchParams.get('assignedLimit') ?? '200', 10) || 200)
  );
  const usedTake = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get('usedLimit') ?? '80', 10) || 80)
  );
  const damageTake = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get('damageLimit') ?? '100', 10) || 100)
  );

  const [groupRows, materialsCatalog, assignedItems, usedItems, damageLossMovements] =
    await Promise.all([
      prisma.privateCompanyMaterialItem.groupBy({
        by: ['materialId', 'status'],
        where: { companyId },
        _count: { _all: true },
      }),
      prisma.privateCompanyMaterial.findMany({
        where: { companyId },
        select: { id: true, name: true, unit: true, color: true, category: true },
      }),
      prisma.privateCompanyMaterialItem.findMany({
        where: { companyId, status: 'ASSIGNED' },
        orderBy: [{ updatedAt: 'desc' }],
        take: assignedTake,
        select: ITEM_ASSIGNED_SELECT,
      }),
      prisma.privateCompanyMaterialItem.findMany({
        where: { companyId, status: 'USED', usedTicketId: { not: null } },
        orderBy: [{ usedAt: 'desc' }, { updatedAt: 'desc' }],
        take: usedTake,
        select: ITEM_USED_SELECT,
      }),
      prisma.privateCompanyMaterialMovement.findMany({
        where: { companyId, type: { in: ['DAMAGED', 'LOST'] } },
        orderBy: { createdAt: 'desc' },
        take: damageTake,
        include: {
          item: {
            select: {
              id: true,
              serialNumber: true,
              status: true,
              material: { select: { id: true, name: true, unit: true, color: true } },
            },
          },
          actor: { select: { id: true, name: true, username: true, role: true } },
          fromStaff: { select: { id: true, name: true, username: true, role: true } },
          ticket: {
            select: { id: true, technique: true, siteName: true, province: true },
          },
        },
      }),
    ]);

  const materialMeta = new Map<
    string,
    { id: string; name: string; unit: string | null; color: string | null; category: string | null }
  >();
  for (const m of materialsCatalog) {
    materialMeta.set(m.id, m);
  }

  type Roll = {
    materialId: string;
    name: string;
    unit: string | null;
    color: string | null;
    category: string | null;
    IN_WAREHOUSE: number;
    ASSIGNED: number;
    USED: number;
    DAMAGED: number;
    LOST: number;
    RETIRED: number;
  };
  const rollMap = new Map<string, Roll>();

  for (const row of groupRows) {
    const mid = row.materialId;
    if (!rollMap.has(mid)) {
      const meta = materialMeta.get(mid);
      rollMap.set(mid, {
        materialId: mid,
        name: meta?.name ?? 'Unknown',
        unit: meta?.unit ?? null,
        color: meta?.color ?? null,
        category: meta?.category ?? null,
        IN_WAREHOUSE: 0,
        ASSIGNED: 0,
        USED: 0,
        DAMAGED: 0,
        LOST: 0,
        RETIRED: 0,
      });
    }
    const bucket = rollMap.get(mid)!;
    const st = row.status as keyof Pick<
      Roll,
      'IN_WAREHOUSE' | 'ASSIGNED' | 'USED' | 'DAMAGED' | 'LOST' | 'RETIRED'
    >;
    if (st in bucket) {
      bucket[st] += row._count._all;
    }
  }

  const materialRollup = Array.from(rollMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    success: true,
    inventoryScope: 'all',
    materialRollup,
    assignedItems,
    recentlyUsedItems: usedItems,
    damageAndLoss: damageLossMovements,
  });
}
