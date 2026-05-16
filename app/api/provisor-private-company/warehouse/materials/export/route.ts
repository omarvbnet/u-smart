import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MANAGER_ROLES = new Set(['MANAGER', 'COORDINATOR']);

/** Catalog rows that are not tool-tagged (spares / consumables). */
const nonToolMaterialFilter = {
  NOT: {
    OR: [
      { category: { contains: 'tool', mode: 'insensitive' } },
      { name: { contains: 'tool', mode: 'insensitive' } },
    ],
  },
};

function iso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  return d != null ? String(d) : '';
}

/**
 * GET /api/provisor-private-company/warehouse/materials/export?departmentId=
 * XLSX: sheet "Catalog" (material definitions), sheet "Stock lines" (every unit + assignments).
 * Same export permission as tools export (owner, manager, coordinator).
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;

  if (!guard.canExportWarehouseTools && !guard.canMutateWarehouse) {
    return NextResponse.json(
      { success: false, message: 'You are not allowed to export this report.' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const ownerDeptParam = url.searchParams.get('departmentId')?.trim() || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereItems: any = {
    companyId: guard.companyId,
    material: nonToolMaterialFilter,
  };

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
    whereItems.AND = [
      {
        OR: [
          { assignedTo: { privateCompanyDepartmentId: dept } },
          { assignedToId: null, status: 'IN_WAREHOUSE' },
        ],
      },
    ];
  } else if (guard.isOwner && ownerDeptParam) {
    whereItems.AND = [
      {
        OR: [
          { assignedTo: { privateCompanyDepartmentId: ownerDeptParam } },
          { assignedToId: null, status: 'IN_WAREHOUSE' },
        ],
      },
    ];
  }

  const [materials, items] = await Promise.all([
    prisma.privateCompanyMaterial.findMany({
      where: {
        companyId: guard.companyId,
        ...nonToolMaterialFilter,
      },
      orderBy: [{ name: 'asc' }],
      take: 5000,
    }),
    prisma.privateCompanyMaterialItem.findMany({
      where: whereItems,
      orderBy: [{ updatedAt: 'desc' }],
      take: 20_000,
      include: {
        material: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            unit: true,
            tracking: true,
            iconKey: true,
            color: true,
          },
        },
        assignedTo: { select: { id: true, name: true, username: true, privateCompanyDepartmentId: true } },
        usedTicket: {
          select: { id: true, siteName: true, technique: true, status: true, province: true },
        },
        createdBy: { select: { id: true, name: true, username: true } },
        handoverConfirmedBy: { select: { id: true, name: true, username: true } },
        returnRequestedBy: { select: { id: true, name: true, username: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { type: true, note: true, createdAt: true, quantity: true },
        },
      },
    }),
  ]);

  const catHeader = [
    'Material ID',
    'Name',
    'Description',
    'Category',
    'Unit',
    'Tracking',
    'Icon key',
    'Color',
    'Created (UTC)',
    'Updated (UTC)',
  ];
  const catRows: (string | number)[][] = [catHeader];
  for (const m of materials) {
    catRows.push([
      m.id,
      m.name,
      m.description ?? '',
      m.category ?? '',
      m.unit ?? '',
      m.tracking,
      m.iconKey ?? '',
      m.color ?? '',
      iso(m.createdAt),
      iso(m.updatedAt),
    ]);
  }

  const stockHeader = [
    'Item ID',
    'Serial / lot',
    'Qty',
    'Province',
    'Status',
    'Notes',
    'Created (UTC)',
    'Updated (UTC)',
    'Used at (UTC)',
    'Material ID',
    'Material name',
    'Material description',
    'Category',
    'Unit',
    'Tracking',
    'Assigned staff ID',
    'Assigned name',
    'Assigned username',
    'Assignee dept ID',
    'Handover confirmed (UTC)',
    'Handover confirmed by',
    'Handover rejected (UTC)',
    'Handover rejection reason',
    'Return requested (UTC)',
    'Return requested by',
    'Return request note',
    'Return rejected (UTC)',
    'Return rejection reason',
    'Used ticket ID',
    'Ticket site',
    'Ticket technique',
    'Ticket status',
    'Ticket province',
    'Stocked by ID',
    'Stocked by name',
    'Last movement type',
    'Last movement qty',
    'Last movement note',
    'Last movement (UTC)',
  ];
  const stockRows: (string | number)[][] = [stockHeader];

  for (const row of items) {
    const lastM = row.movements?.[0];
    stockRows.push([
      row.id,
      row.serialNumber,
      row.quantity,
      row.province,
      row.status,
      row.notes ?? '',
      iso(row.createdAt),
      iso(row.updatedAt),
      iso(row.usedAt),
      row.material?.id ?? '',
      row.material?.name ?? '',
      row.material?.description ?? '',
      row.material?.category ?? '',
      row.material?.unit ?? '',
      row.material?.tracking ?? '',
      row.assignedToId ?? '',
      row.assignedTo?.name ?? '',
      row.assignedTo?.username ?? '',
      row.assignedTo?.privateCompanyDepartmentId ?? '',
      iso(row.handoverConfirmedAt),
      row.handoverConfirmedBy?.username ?? row.handoverConfirmedBy?.name ?? '',
      iso(row.handoverRejectedAt),
      row.handoverRejectionReason ?? '',
      iso(row.returnRequestedAt),
      row.returnRequestedBy?.username ?? row.returnRequestedBy?.name ?? '',
      row.returnRequestNote ?? '',
      iso(row.returnRejectedAt),
      row.returnRejectionReason ?? '',
      row.usedTicketId ?? '',
      row.usedTicket?.siteName ?? '',
      row.usedTicket?.technique ?? '',
      row.usedTicket?.status ?? '',
      row.usedTicket?.province ?? '',
      row.createdById ?? '',
      row.createdBy?.name ?? row.createdBy?.username ?? '',
      lastM?.type ?? '',
      lastM?.quantity ?? '',
      lastM?.note ?? '',
      lastM ? iso(lastM.createdAt) : '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), 'Catalog');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockRows), 'Stock lines');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const u8 = Uint8Array.from(buf);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new NextResponse(u8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="warehouse-materials-${stamp}.xlsx"`,
      'Content-Length': String(u8.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
