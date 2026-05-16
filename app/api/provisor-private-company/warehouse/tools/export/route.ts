import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

function conditionAndReason(args: {
  status: string;
  handoverConfirmedAt: Date | null;
  notes: string | null;
  lastMovementNote: string | null;
}): { condition: string; reason: string } {
  const bits = [args.notes, args.lastMovementNote].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );
  const reason = bits.join(' | ');
  const st = args.status;
  if (st === 'DAMAGED') return { condition: 'Broken / damaged', reason };
  if (st === 'LOST') return { condition: 'Lost', reason };
  if (st === 'USED') return { condition: 'Used (consumed)', reason };
  if (st === 'RETIRED') return { condition: 'Retired', reason };
  if (st === 'IN_WAREHOUSE') return { condition: 'New / in warehouse', reason };
  if (st === 'ASSIGNED') {
    if (!args.handoverConfirmedAt) return { condition: 'Assigned — pending receipt', reason };
    return { condition: 'In use', reason };
  }
  return { condition: st, reason };
}

/**
 * GET /api/provisor-private-company/warehouse/tools/export?toolsOnly=1&departmentId=
 * XLSX snapshot of tool-tagged inventory (assignments + unassigned stock).
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;

  if (!guard.canExportWarehouseTools) {
    return NextResponse.json(
      { success: false, message: 'You are not allowed to export this report.' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const toolsOnly = url.searchParams.get('toolsOnly') !== '0';
  const toolMatFilter = {
    OR: [
      { category: { contains: 'tool', mode: 'insensitive' } },
      { name: { contains: 'tool', mode: 'insensitive' } },
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    companyId: guard.companyId,
    ...(toolsOnly ? { material: toolMatFilter } : {}),
  };

  const ownerDeptParam = url.searchParams.get('departmentId')?.trim() || null;

  if (!guard.isOwner && MANAGER_ROLES.has(guard.actorRole)) {
    if (!guard.actorDepartmentId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Your account must belong to a department to export this report.',
        },
        { status: 403 }
      );
    }
    if (ownerDeptParam && ownerDeptParam !== guard.actorDepartmentId) {
      return NextResponse.json(
        { success: false, message: 'You can only export data for your department.' },
        { status: 403 }
      );
    }
    const dept = guard.actorDepartmentId;
    where.AND = [
      {
        OR: [
          { assignedTo: { privateCompanyDepartmentId: dept } },
          { assignedToId: null, status: 'IN_WAREHOUSE' },
        ],
      },
    ];
  } else if (guard.isOwner && ownerDeptParam) {
    where.AND = [
      {
        OR: [
          { assignedTo: { privateCompanyDepartmentId: ownerDeptParam } },
          { assignedToId: null, status: 'IN_WAREHOUSE' },
        ],
      },
    ];
  }

  const items = await prisma.privateCompanyMaterialItem.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: 10_000,
    include: {
      material: { select: { name: true, category: true } },
      assignedTo: { select: { id: true, name: true, username: true } },
      movements: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { note: true },
      },
    },
  });

  const header = [
    'Last updated (UTC)',
    'Staff ID',
    'Staff name',
    'Staff username',
    'Tool / material',
    'Category',
    'Serial',
    'Warehouse status',
    'Condition',
    'Province',
    'Reason / notes',
  ];
  const data: (string | number)[][] = [header];

  for (const row of items) {
    const lastNote = row.movements?.[0]?.note ?? null;
    const { condition, reason } = conditionAndReason({
      status: row.status,
      handoverConfirmedAt: row.handoverConfirmedAt,
      notes: row.notes,
      lastMovementNote: lastNote,
    });
    const updated =
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? '');
    data.push([
      updated,
      row.assignedToId ?? '',
      row.assignedTo?.name ?? '',
      row.assignedTo?.username ?? '',
      row.material?.name ?? '',
      row.material?.category ?? '',
      row.serialNumber,
      row.status,
      condition,
      row.province,
      reason,
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Tools');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const u8 = Uint8Array.from(buf);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new NextResponse(u8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="warehouse-tools-${stamp}.xlsx"`,
      'Content-Length': String(u8.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
