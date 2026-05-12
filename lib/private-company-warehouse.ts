import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * Only the workspace owner (COMPANY) and dedicated warehouse keepers may
 * create catalog entries, stock serials, import Excel, assign/transfer items,
 * or mark damaged/lost. Managers, coordinators, and keepers may browse the
 * full workspace inventory; field roles (engineer / technician / worker, etc.)
 * only see units assigned to them and related movement rows.
 */
export const CAN_MUTATE_WAREHOUSE_ROLES = new Set(['COMPANY', 'WAREHOUSE_KEEPER']);

/** Roles that may list and aggregate all warehouse items and catalog rows. */
export const CAN_VIEW_ALL_WAREHOUSE_INVENTORY_ROLES = new Set([
  'MANAGER',
  'COORDINATOR',
  'WAREHOUSE_KEEPER',
]);

/**
 * Roles that can record material consumption against a maintenance ticket
 * they are working on.
 */
export const CAN_USE_MATERIALS_ON_TICKET_ROLES = new Set([
  'COMPANY',
  'MANAGER',
  'COORDINATOR',
  'ENGINEER',
  'TECHNICIAN',
  'WORKER',
]);

export const IRAQ_PROVINCES = [
  'Al-Anbar',
  'Babil',
  'Baghdad',
  'Basra',
  'Dhi Qar',
  'Al-Qadisiyyah',
  'Diyala',
  'Duhok',
  'Erbil',
  'Halabja',
  'Karbala',
  'Kirkuk',
  'Maysan',
  'Muthanna',
  'Najaf',
  'Ninawa',
  'Salah Al-Din',
  'Sulaymaniyah',
  'Wasit',
] as const;

const IRAQ_PROVINCE_INDEX = new Map(
  IRAQ_PROVINCES.map((p) => [p.toLowerCase(), p])
);

export function normalizeProvince(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return IRAQ_PROVINCE_INDEX.get(trimmed.toLowerCase()) ?? null;
}

export type WarehouseGuardSuccess = {
  ok: true;
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
  /** Stock, catalog edits, assign/transfer/damage/lose/import. */
  canMutateWarehouse: boolean;
  /** Read-only: everyone in an active workspace can browse inventory & logs. */
  canViewWarehouse: boolean;
  /** Full catalog + stock; false = only items assigned to this requester. */
  canViewAllWarehouseInventory: boolean;
  canUseOnTicket: boolean;
  /**
   * @deprecated Use canMutateWarehouse — kept for gradual migration in routes.
   */
  canManage: boolean;
};

export type WarehouseGuardFailure = {
  ok: false;
  response: NextResponse;
};

export type WarehouseGuardResult = WarehouseGuardSuccess | WarehouseGuardFailure;

function jsonError(message: string, status = 403): WarehouseGuardFailure {
  return { ok: false, response: NextResponse.json({ success: false, message }, { status }) };
}

/**
 * Returns the warehouse guard context for the current request.
 *
 * @param opts.requireMutate — when true, only owner + WAREHOUSE_KEEPER may proceed.
 */
export async function warehouseGuard(
  req: NextRequest,
  opts: { requireMutate?: boolean; requireManager?: boolean } = {}
): Promise<WarehouseGuardResult> {
  const requireMutate = opts.requireMutate === true || opts.requireManager === true;
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'Not authenticated.' },
        { status: 401 }
      ),
    };
  }
  const requesterId = auth.payload.requesterId;
  const m = await getPrivateCompanyMembership(requesterId);
  if (!m.effectiveCompanyId || !m.isActive) {
    return jsonError('You are not part of an active private workspace.', 403);
  }
  const isOwner =
    !!m.ownedCompanyId &&
    m.ownedCompanyStatus === 'APPROVED' &&
    m.ownedCompanyId === m.effectiveCompanyId;

  let actorRole = 'COMPANY';
  let actorDepartmentId: string | null = null;
  if (!isOwner) {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: requesterId },
      select: { role: true, privateCompanyDepartmentId: true },
    });
    actorRole = String(me?.role ?? '').toUpperCase();
    actorDepartmentId = me?.privateCompanyDepartmentId ?? null;
  }

  const canMutateWarehouse = isOwner || CAN_MUTATE_WAREHOUSE_ROLES.has(actorRole);
  const canViewWarehouse = true;
  const canViewAllWarehouseInventory =
    isOwner || CAN_VIEW_ALL_WAREHOUSE_INVENTORY_ROLES.has(actorRole);
  const canUseOnTicket = isOwner || CAN_USE_MATERIALS_ON_TICKET_ROLES.has(actorRole);

  if (requireMutate && !canMutateWarehouse) {
    return jsonError(
      'Only the workspace owner or a warehouse keeper can add, import, assign, or manage materials.',
      403
    );
  }

  return {
    ok: true,
    requesterId,
    companyId: m.effectiveCompanyId,
    isOwner,
    actorRole,
    actorDepartmentId,
    canMutateWarehouse,
    canViewWarehouse,
    canViewAllWarehouseInventory,
    canUseOnTicket,
    canManage: canMutateWarehouse,
  };
}

/**
 * Record a movement against an item. The movement table is append-only and
 * is the audit log used by the dashboard / activity feed.
 */
export async function logMovement(args: {
  companyId: string;
  itemId: string;
  type:
    | 'STOCKED'
    | 'ASSIGNED'
    | 'RETURNED'
    | 'USED'
    | 'TRANSFERRED'
    | 'DAMAGED'
    | 'LOST'
    | 'ADJUSTED';
  fromStaffId?: string | null;
  toStaffId?: string | null;
  ticketId?: string | null;
  quantity?: number;
  note?: string | null;
  actorId: string;
}) {
  return prisma.privateCompanyMaterialMovement.create({
    data: {
      companyId: args.companyId,
      itemId: args.itemId,
      type: args.type,
      fromStaffId: args.fromStaffId ?? null,
      toStaffId: args.toStaffId ?? null,
      ticketId: args.ticketId ?? null,
      quantity: args.quantity ?? 1,
      note: args.note ?? null,
      actorId: args.actorId,
    },
  });
}
