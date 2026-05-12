import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/warehouse/dashboard
 *
 * Aggregated counters used by the warehouse home screen:
 *   - total / in_warehouse / assigned / used / damaged / lost / retired
 *   - per-province breakdown (governorate -> count)
 *   - per-material breakdown (top 8 SKUs)
 *   - per-staff "holding" breakdown (staff -> currently held count)
 *   - tickets that consumed the most items recently
 *   - last 10 movements (timeline)
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const companyId = guard.companyId;
  const inventoryScope = guard.canViewAllWarehouseInventory ? 'all' : 'assigned';
  const itemWhere = guard.canViewAllWarehouseInventory
    ? { companyId }
    : { companyId, assignedToId: guard.requesterId };

  // Status totals (single grouped query is more efficient than N counts).
  const statusRows: Array<{ status: string; _count: { _all: number } }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['status'],
    where: itemWhere,
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = {
    IN_WAREHOUSE: 0,
    ASSIGNED: 0,
    USED: 0,
    DAMAGED: 0,
    LOST: 0,
    RETIRED: 0,
  };
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const provinceRows: Array<{ province: string; _count: { _all: number } }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['province'],
    where: itemWhere,
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });
  const byProvince = provinceRows.map((r) => ({ province: r.province, count: r._count._all }));

  const materialRows: Array<{ materialId: string; _count: { _all: number } }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['materialId'],
    where: itemWhere,
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 12,
  });
  const materialMeta = await prisma.privateCompanyMaterial.findMany({
    where: { companyId, id: { in: materialRows.map((r) => r.materialId) } },
    select: { id: true, name: true, color: true, unit: true },
  });
  const materialById = new Map<string, { id: string; name: string; color: string | null; unit: string | null }>();
  for (const m of materialMeta) materialById.set(m.id, m);
  const byMaterial = materialRows.map((r) => ({
    materialId: r.materialId,
    name: materialById.get(r.materialId)?.name ?? 'Unknown',
    color: materialById.get(r.materialId)?.color ?? null,
    unit: materialById.get(r.materialId)?.unit ?? null,
    count: r._count._all,
  }));

  // Currently held by staff (only items in ASSIGNED status).
  const heldRows: Array<{ assignedToId: string | null; _count: { _all: number } }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['assignedToId'],
    where: { ...itemWhere, status: 'ASSIGNED', assignedToId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 12,
  });
  const staffMeta = await prisma.ticketRequester.findMany({
    where: { id: { in: heldRows.map((r) => r.assignedToId).filter(Boolean) as string[] } },
    select: { id: true, name: true, username: true, role: true, province: true },
  });
  const staffById = new Map<string, { id: string; name: string | null; username: string; role: string; province: string | null }>();
  for (const s of staffMeta) staffById.set(s.id, s);
  const heldByStaff = heldRows.map((r) => ({
    staffId: r.assignedToId,
    name: r.assignedToId ? staffById.get(r.assignedToId)?.name : null,
    username: r.assignedToId ? staffById.get(r.assignedToId)?.username : null,
    role: r.assignedToId ? staffById.get(r.assignedToId)?.role : null,
    province: r.assignedToId ? staffById.get(r.assignedToId)?.province : null,
    count: r._count._all,
  }));

  // Tickets with the most consumed items (top 6).
  const ticketUsageRows: Array<{ usedTicketId: string | null; _count: { _all: number } }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['usedTicketId'],
    where: { ...itemWhere, status: 'USED', usedTicketId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 6,
  });
  const ticketIds = ticketUsageRows.map((r) => r.usedTicketId).filter(Boolean) as string[];
  const ticketMeta = ticketIds.length
    ? await prisma.visitorRequest.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, technique: true, siteName: true, province: true, status: true },
      })
    : [];
  const ticketById = new Map<string, { id: string; technique: string; siteName: string | null; province: string; status: string }>();
  for (const t of ticketMeta) ticketById.set(t.id, t);
  const topUsageTickets = ticketUsageRows.map((r) => ({
    ticketId: r.usedTicketId,
    technique: r.usedTicketId ? ticketById.get(r.usedTicketId)?.technique ?? null : null,
    siteName: r.usedTicketId ? ticketById.get(r.usedTicketId)?.siteName ?? null : null,
    province: r.usedTicketId ? ticketById.get(r.usedTicketId)?.province ?? null : null,
    status: r.usedTicketId ? ticketById.get(r.usedTicketId)?.status ?? null : null,
    used: r._count._all,
  }));

  const movementWhere = guard.canViewAllWarehouseInventory
    ? { companyId }
    : {
        AND: [
          { companyId },
          {
            OR: [
              { item: { assignedToId: guard.requesterId } },
              { fromStaffId: guard.requesterId },
              { toStaffId: guard.requesterId },
              { actorId: guard.requesterId },
            ],
          },
        ],
      };

  // Recent activity feed (10 most recent movements).
  const movements = await prisma.privateCompanyMaterialMovement.findMany({
    where: movementWhere,
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      item: { select: { id: true, serialNumber: true, material: { select: { id: true, name: true } } } },
      actor: { select: { id: true, name: true, username: true } },
      fromStaff: { select: { id: true, name: true, username: true } },
      toStaff: { select: { id: true, name: true, username: true } },
      ticket: { select: { id: true, technique: true, siteName: true } },
    },
  });

  const materialsCount = guard.canViewAllWarehouseInventory
    ? await prisma.privateCompanyMaterial.count({ where: { companyId } })
    : await prisma.privateCompanyMaterial.count({
        where: {
          companyId,
          items: { some: { assignedToId: guard.requesterId } },
        },
      });

  return NextResponse.json({
    success: true,
    inventoryScope,
    summary: {
      total,
      byStatus,
      materialsCount,
    },
    byProvince,
    byMaterial,
    heldByStaff,
    topUsageTickets,
    recentMovements: movements,
  });
}
