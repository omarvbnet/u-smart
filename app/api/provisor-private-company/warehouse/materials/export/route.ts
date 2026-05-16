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

type Mov = {
  itemId: string;
  type: string;
  quantity: number;
  note: string | null;
  createdAt: Date;
  ticketId: string | null;
  actor: { id: string; name: string | null; username: string } | null;
  ticket: {
    id: string;
    siteName: string | null;
    technique: string | null;
    status: string;
  } | null;
};

function actorLabel(a: { name: string | null; username: string } | null): string {
  if (!a) return '';
  return (a.name?.trim() || a.username || a.id) as string;
}

function humanItemStatus(row: {
  status: string;
  handoverConfirmedAt: Date | null;
}): string {
  const s = row.status;
  if (s === 'IN_WAREHOUSE') return 'In warehouse (available / new stock)';
  if (s === 'ASSIGNED') {
    return row.handoverConfirmedAt
      ? 'Assigned — receipt confirmed by staff'
      : 'Assigned — pending staff receipt';
  }
  if (s === 'USED') return 'Used / consumed on ticket';
  if (s === 'DAMAGED') return 'Damaged';
  if (s === 'LOST') return 'Lost';
  if (s === 'RETIRED') return 'Retired';
  return s;
}

function firstMovementOfType(mv: Mov[], type: string): Mov | null {
  for (const m of mv) {
    if (m.type === type) return m;
  }
  return null;
}

function lastMovementOfType(mv: Mov[], type: string): Mov | null {
  for (let i = mv.length - 1; i >= 0; i--) {
    if (mv[i].type === type) return mv[i];
  }
  return null;
}

function movementTrail(mv: Mov[], max = 20): string {
  const tail = mv.slice(-max);
  return tail
    .map((m) => {
      const who = actorLabel(m.actor);
      const tk = m.ticketId ?? m.ticket?.id ?? '';
      const bits = [
        m.type,
        iso(m.createdAt),
        `qty:${m.quantity}`,
        who && `by:${who}`,
        tk && `ticket:${tk}`,
        m.note?.trim() && `note:${String(m.note).slice(0, 120)}`,
      ].filter(Boolean);
      return bits.join(' | ');
    })
    .join(' → ');
}

/**
 * GET /api/provisor-private-company/warehouse/materials/export?departmentId=
 * XLSX: Catalog, Totals by material (qty + line counts by status), Stock lines (serials + assignments + movement audit).
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
      orderBy: [{ materialId: 'asc' }, { serialNumber: 'asc' }],
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
      },
    }),
  ]);

  const itemIds = (items as Array<{ id: string }>).map((r) => r.id);
  const movementRows: Mov[] =
    itemIds.length > 0
      ? await prisma.privateCompanyMaterialMovement.findMany({
          where: { companyId: guard.companyId, itemId: { in: itemIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            itemId: true,
            type: true,
            quantity: true,
            note: true,
            createdAt: true,
            ticketId: true,
            actor: { select: { id: true, name: true, username: true } },
            ticket: { select: { id: true, siteName: true, technique: true, status: true } },
          },
        })
      : [];

  const movByItem = new Map<string, Mov[]>();
  for (const m of movementRows) {
    const arr = movByItem.get(m.itemId) ?? [];
    arr.push(m as Mov);
    movByItem.set(m.itemId, arr);
  }

  type TotAgg = {
    name: string;
    unit: string;
    linesInWh: number;
    qtyInWh: number;
    linesAssigned: number;
    qtyAssigned: number;
    linesUsed: number;
    qtyUsed: number;
    linesDamaged: number;
    qtyDamaged: number;
    linesLost: number;
    qtyLost: number;
    linesOther: number;
    qtyOther: number;
    linesTotal: number;
    qtyTotal: number;
  };
  const totals = new Map<string, TotAgg>();

  function bumpTotal(mid: string, name: string, unit: string, status: string, qty: number) {
    let a = totals.get(mid);
    if (!a) {
      a = {
        name,
        unit,
        linesInWh: 0,
        qtyInWh: 0,
        linesAssigned: 0,
        qtyAssigned: 0,
        linesUsed: 0,
        qtyUsed: 0,
        linesDamaged: 0,
        qtyDamaged: 0,
        linesLost: 0,
        qtyLost: 0,
        linesOther: 0,
        qtyOther: 0,
        linesTotal: 0,
        qtyTotal: 0,
      };
      totals.set(mid, a);
    }
    a.linesTotal += 1;
    a.qtyTotal += qty;
    switch (status) {
      case 'IN_WAREHOUSE':
        a.linesInWh += 1;
        a.qtyInWh += qty;
        break;
      case 'ASSIGNED':
        a.linesAssigned += 1;
        a.qtyAssigned += qty;
        break;
      case 'USED':
        a.linesUsed += 1;
        a.qtyUsed += qty;
        break;
      case 'DAMAGED':
        a.linesDamaged += 1;
        a.qtyDamaged += qty;
        break;
      case 'LOST':
        a.linesLost += 1;
        a.qtyLost += qty;
        break;
      default:
        a.linesOther += 1;
        a.qtyOther += qty;
    }
  }

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

  for (const row of items as Array<{
    id: string;
    materialId: string;
    serialNumber: string;
    province: string;
    status: string;
    quantity: number;
    notes: string | null;
    assignedToId: string | null;
    usedTicketId: string | null;
    usedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    handoverConfirmedAt: Date | null;
    handoverRejectedAt: Date | null;
    handoverRejectionReason: string | null;
    returnRequestedAt: Date | null;
    returnRequestNote: string | null;
    returnRejectedAt: Date | null;
    returnRejectionReason: string | null;
    material: {
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      unit: string | null;
      tracking: string;
    } | null;
    assignedTo: {
      id: string;
      name: string | null;
      username: string;
      privateCompanyDepartmentId: string | null;
    } | null;
    usedTicket: {
      id: string;
      siteName: string | null;
      technique: string | null;
      status: string;
      province: string | null;
    } | null;
    createdBy: { id: string; name: string | null; username: string } | null;
    handoverConfirmedBy: { id: string; name: string | null; username: string } | null;
    returnRequestedBy: { id: string; name: string | null; username: string } | null;
  }>) {
    const mid = row.materialId;
    const mname = row.material?.name ?? '';
    const munit = row.material?.unit ?? '';
    bumpTotal(mid, mname, munit, row.status, row.quantity ?? 1);
  }

  const sumHeader = [
    'Material ID',
    'Material name',
    'Unit',
    '# Lines in warehouse',
    'Qty in warehouse',
    '# Lines assigned',
    'Qty assigned',
    '# Lines used (ticket)',
    'Qty used',
    '# Lines damaged',
    'Qty damaged',
    '# Lines lost',
    'Qty lost',
    '# Lines other status',
    'Qty other',
    'Total lines',
    'Total qty',
  ];
  const sumRows: (string | number)[][] = [sumHeader];
  const sortedMids = [...totals.keys()].sort();
  for (const mid of sortedMids) {
    const a = totals.get(mid)!;
    sumRows.push([
      mid,
      a.name,
      a.unit,
      a.linesInWh,
      a.qtyInWh,
      a.linesAssigned,
      a.qtyAssigned,
      a.linesUsed,
      a.qtyUsed,
      a.linesDamaged,
      a.qtyDamaged,
      a.linesLost,
      a.qtyLost,
      a.linesOther,
      a.qtyOther,
      a.linesTotal,
      a.qtyTotal,
    ]);
  }

  const stockHeader = [
    'Material name',
    'Category',
    'Unit',
    'Serial / lot',
    'Line qty',
    'Province',
    'Status (code)',
    'Status (summary)',
    'Material ID',
    'Item ID',
    'Assigned to staff ID',
    'Assigned to name',
    'Assigned to username',
    'Assignee department ID',
    'First stocked (UTC)',
    'Stocked by',
    'Last ASSIGN movement (UTC)',
    'Last assigned by',
    'Last ASSIGN qty',
    'Last ASSIGN ticket ID',
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
    'Used at on item (UTC)',
    'Last USED movement (UTC)',
    'Used recorded by (movement)',
    'USE movement ticket ID',
    'USE movement note',
    'Last TRANSFER (UTC)',
    'Transfer by',
    'Notes on item',
    'Row created (UTC)',
    'Row updated (UTC)',
    'Initial stocker ID',
    'Initial stocker',
    'Movement audit (oldest→newest, truncated)',
  ];
  const stockRows: (string | number)[][] = [stockHeader];

  for (const row of items as Array<{
    id: string;
    materialId: string;
    serialNumber: string;
    province: string;
    status: string;
    quantity: number;
    notes: string | null;
    assignedToId: string | null;
    usedTicketId: string | null;
    usedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    handoverConfirmedAt: Date | null;
    handoverRejectedAt: Date | null;
    handoverRejectionReason: string | null;
    returnRequestedAt: Date | null;
    returnRequestNote: string | null;
    returnRejectedAt: Date | null;
    returnRejectionReason: string | null;
    material: {
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      unit: string | null;
      tracking: string;
    } | null;
    assignedTo: {
      id: string;
      name: string | null;
      username: string;
      privateCompanyDepartmentId: string | null;
    } | null;
    usedTicket: {
      id: string;
      siteName: string | null;
      technique: string | null;
      status: string;
      province: string | null;
    } | null;
    createdBy: { id: string; name: string | null; username: string } | null;
    createdById: string | null;
    handoverConfirmedBy: { id: string; name: string | null; username: string } | null;
    returnRequestedBy: { id: string; name: string | null; username: string } | null;
  }>) {
    const mv = movByItem.get(row.id) ?? [];
    const firstStock = firstMovementOfType(mv, 'STOCKED');
    const lastAssign = lastMovementOfType(mv, 'ASSIGNED');
    const lastUsedM = lastMovementOfType(mv, 'USED');
    const lastXfer = lastMovementOfType(mv, 'TRANSFERRED');

    stockRows.push([
      row.material?.name ?? '',
      row.material?.category ?? '',
      row.material?.unit ?? '',
      row.serialNumber,
      row.quantity,
      row.province,
      row.status,
      humanItemStatus(row),
      row.material?.id ?? '',
      row.id,
      row.assignedToId ?? '',
      row.assignedTo?.name ?? '',
      row.assignedTo?.username ?? '',
      row.assignedTo?.privateCompanyDepartmentId ?? '',
      firstStock ? iso(firstStock.createdAt) : '',
      actorLabel(firstStock?.actor ?? null),
      lastAssign ? iso(lastAssign.createdAt) : '',
      actorLabel(lastAssign?.actor ?? null),
      lastAssign?.quantity ?? '',
      lastAssign?.ticketId ?? lastAssign?.ticket?.id ?? '',
      iso(row.handoverConfirmedAt),
      row.handoverConfirmedBy?.username ?? row.handoverConfirmedBy?.name ?? '',
      iso(row.handoverRejectedAt),
      row.handoverRejectionReason ?? '',
      iso(row.returnRequestedAt),
      row.returnRequestedBy?.username ?? row.returnRequestedBy?.name ?? '',
      row.returnRequestNote ?? '',
      iso(row.returnRejectedAt),
      row.returnRejectionReason ?? '',
      row.usedTicketId ?? row.usedTicket?.id ?? '',
      row.usedTicket?.siteName ?? '',
      row.usedTicket?.technique ?? '',
      row.usedTicket?.status ?? '',
      row.usedTicket?.province ?? '',
      iso(row.usedAt),
      lastUsedM ? iso(lastUsedM.createdAt) : '',
      actorLabel(lastUsedM?.actor ?? null),
      lastUsedM?.ticketId ?? lastUsedM?.ticket?.id ?? '',
      lastUsedM?.note ?? '',
      lastXfer ? iso(lastXfer.createdAt) : '',
      actorLabel(lastXfer?.actor ?? null),
      row.notes ?? '',
      iso(row.createdAt),
      iso(row.updatedAt),
      row.createdById ?? '',
      actorLabel(row.createdBy),
      movementTrail(mv, 25),
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), 'Catalog');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Totals by material');
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
