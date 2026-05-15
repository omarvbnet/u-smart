import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { normalizeProvince, warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/warehouse/province-inventory?province=Baghdad
 *
 * Full workspace inventory in one governorate: per-material quantities by status
 * and line counts. Owner, manager, coordinator, and warehouse keeper only.
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  if (!guard.canViewAllWarehouseInventory) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  const province = normalizeProvince(new URL(req.url).searchParams.get('province'));
  if (!province) {
    return NextResponse.json(
      { success: false, message: 'Invalid or missing province.' },
      { status: 400 }
    );
  }
  const companyId = guard.companyId;
  const baseWhere = { companyId, province };

  const qtyRows: Array<{
    materialId: string;
    status: string;
    _sum: { quantity: number | null };
  }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['materialId', 'status'],
    where: baseWhere,
    _sum: { quantity: true },
  });

  const lineRows: Array<{ materialId: string; _count: { _all: number } }> =
    await prisma.privateCompanyMaterialItem.groupBy({
      by: ['materialId'],
      where: baseWhere,
      _count: { _all: true },
    });
  const linesByMaterial = new Map<string, number>();
  for (const r of lineRows) {
    linesByMaterial.set(r.materialId, r._count._all);
  }

  const statusRows: Array<{
    status: string;
    _sum: { quantity: number | null };
    _count: { _all: number };
  }> = await prisma.privateCompanyMaterialItem.groupBy({
    by: ['status'],
    where: baseWhere,
    _sum: { quantity: true },
    _count: { _all: true },
  });

  const statusTotals: Record<string, { quantity: number; lines: number }> = {};
  for (const row of statusRows) {
    const q = Math.max(0, Math.floor(Number(row._sum.quantity) || 0));
    statusTotals[row.status] = {
      quantity: q,
      lines: row._count._all,
    };
  }

  const byMaterial = new Map<
    string,
    { byStatus: Record<string, number>; totalQuantity: number }
  >();
  for (const row of qtyRows) {
    const q = Math.max(0, Math.floor(Number(row._sum.quantity) || 0));
    const cur = byMaterial.get(row.materialId) ?? {
      byStatus: {},
      totalQuantity: 0,
    };
    cur.byStatus[row.status] = (cur.byStatus[row.status] ?? 0) + q;
    cur.totalQuantity += q;
    byMaterial.set(row.materialId, cur);
  }

  const materialIds = [...byMaterial.keys()];
  const materialMeta = materialIds.length
    ? await prisma.privateCompanyMaterial.findMany({
        where: { companyId, id: { in: materialIds } },
        select: { id: true, name: true, unit: true, category: true, color: true },
      })
    : [];
  const metaById = new Map(materialMeta.map((m: { id: string }) => [m.id, m]));

  const materials = [...byMaterial.entries()]
    .map(([materialId, agg]) => {
      const meta = metaById.get(materialId) as
        | {
            id: string;
            name: string;
            unit: string | null;
            category: string | null;
            color: string | null;
          }
        | undefined;
      return {
        materialId,
        name: meta?.name ?? 'Unknown',
        unit: meta?.unit ?? null,
        category: meta?.category ?? null,
        color: meta?.color ?? null,
        byStatus: agg.byStatus,
        totalQuantity: agg.totalQuantity,
        lineCount: linesByMaterial.get(materialId) ?? 0,
      };
    })
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  const itemRows = await prisma.privateCompanyMaterialItem.findMany({
    where: baseWhere,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      serialNumber: true,
      status: true,
      quantity: true,
      materialId: true,
      assignedToId: true,
      handoverConfirmedAt: true,
      handoverRejectedAt: true,
      handoverRejectionReason: true,
      returnRequestedAt: true,
      returnRequestNote: true,
      usedAt: true,
      material: { select: { id: true, name: true, unit: true, color: true } },
      assignedTo: { select: { id: true, name: true, username: true, role: true } },
      usedTicket: {
        select: { id: true, siteName: true, technique: true, province: true },
      },
      movements: {
        where: { type: 'RETURNED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { note: true, createdAt: true },
      },
    },
  });

  const items = (itemRows as Array<Record<string, unknown>>).map((row) => {
    const status = String(row.status ?? '');
    const assigned = row.assignedTo as Record<string, unknown> | null;
    const ticket = row.usedTicket as Record<string, unknown> | null;
    const lastReturn = Array.isArray(row.movements)
      ? (row.movements as Array<{ note?: string | null }>)[0]
      : null;
    const returnNote = lastReturn?.note ?? '';
    let stockCondition: 'new' | 'used' | null = null;
    if (status === 'IN_WAREHOUSE' && returnNote.includes('Return: used')) stockCondition = 'used';
    if (status === 'IN_WAREHOUSE' && returnNote.includes('Return: new')) stockCondition = 'new';

    return {
      id: row.id,
      serialNumber: row.serialNumber,
      status,
      quantity: row.quantity,
      materialId: row.materialId,
      materialName: (row.material as { name?: string })?.name ?? null,
      materialUnit: (row.material as { unit?: string | null })?.unit ?? null,
      materialColor: (row.material as { color?: string | null })?.color ?? null,
      assignmentState:
        status === 'ASSIGNED'
          ? assigned
            ? row.handoverConfirmedAt
              ? 'assigned_confirmed'
              : 'assigned_pending_receipt'
            : 'assigned'
          : status === 'IN_WAREHOUSE'
            ? 'in_warehouse'
            : status === 'USED'
              ? 'used'
              : status.toLowerCase(),
      stockCondition,
      assignedToId: row.assignedToId,
      assignedToName: assigned?.name ?? assigned?.username ?? null,
      handoverPending:
        status === 'ASSIGNED' && !!row.assignedToId && !row.handoverConfirmedAt,
      returnPending: !!row.returnRequestedAt,
      handoverRejectionReason: row.handoverRejectionReason ?? null,
      returnRequestNote: row.returnRequestNote ?? null,
      usedAt: row.usedAt,
      usedSiteName: ticket?.siteName ?? null,
      usedTicketTechnique: ticket?.technique ?? null,
      usedTicketProvince: ticket?.province ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    inventoryScope: 'all' as const,
    province,
    statusTotals,
    materials,
    items,
  });
}
