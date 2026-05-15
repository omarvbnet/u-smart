import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';
import { materialSupportsPartialConsumption } from '@/lib/material-quantity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/provisor-private-company/warehouse/my-held-materials
 *
 * Assigned stock grouped by catalog material (sum of quantities on confirmed lines).
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;

  const lines = await prisma.privateCompanyMaterialItem.findMany({
    where: {
      companyId: guard.companyId,
      assignedToId: guard.requesterId,
      status: 'ASSIGNED',
      handoverConfirmedAt: { not: null },
      returnRequestedAt: null,
    },
    select: {
      id: true,
      serialNumber: true,
      quantity: true,
      materialId: true,
      handoverConfirmedAt: true,
      material: {
        select: { id: true, name: true, unit: true, color: true, tracking: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byMaterial = new Map<
    string,
    {
      materialId: string;
      name: string;
      unit: string | null;
      color: string | null;
      tracking: string;
      partialConsumption: boolean;
      totalQuantity: number;
      lineCount: number;
      lines: Array<{ id: string; serialNumber: string; quantity: number }>;
    }
  >();

  for (const row of lines as Array<{
    id: string;
    serialNumber: string;
    quantity: number;
    materialId: string;
    material: { id: string; name: string; unit: string | null; color: string | null; tracking: string };
  }>) {
    const q = Math.max(1, Math.floor(Number(row.quantity)) || 1);
    const cur = byMaterial.get(row.materialId) ?? {
      materialId: row.materialId,
      name: row.material.name,
      unit: row.material.unit,
      color: row.material.color,
      tracking: row.material.tracking,
      partialConsumption: materialSupportsPartialConsumption({
        tracking: row.material.tracking,
        unit: row.material.unit,
      }),
      totalQuantity: 0,
      lineCount: 0,
      lines: [],
    };
    cur.totalQuantity += q;
    cur.lineCount += 1;
    cur.lines.push({ id: row.id, serialNumber: row.serialNumber, quantity: q });
    byMaterial.set(row.materialId, cur);
  }

  const materials = [...byMaterial.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const pendingHandover = await prisma.privateCompanyMaterialItem.count({
    where: {
      companyId: guard.companyId,
      assignedToId: guard.requesterId,
      status: 'ASSIGNED',
      handoverConfirmedAt: null,
    },
  });

  return NextResponse.json({
    success: true,
    materials,
    pendingHandoverCount: pendingHandover,
  });
}
