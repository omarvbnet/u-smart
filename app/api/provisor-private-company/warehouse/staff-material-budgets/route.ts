import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { warehouseGuard } from '@/lib/private-company-warehouse';
import {
  assertStaffInCompany,
  canManageStaffMaterialBudgets,
  canViewStaffMaterialBudgets,
  sumAssignedQuantityForStaffMaterial,
  type BudgetAccessActor,
} from '@/lib/private-company-staff-budget-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function toActor(guard: {
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
}): BudgetAccessActor {
  return {
    requesterId: guard.requesterId,
    companyId: guard.companyId,
    isOwner: guard.isOwner,
    actorRole: guard.actorRole,
    actorDepartmentId: guard.actorDepartmentId,
  };
}

async function assertManagerCanEditStaff(
  actor: BudgetAccessActor,
  targetStaffId: string
): Promise<NextResponse | null> {
  if (actor.isOwner) return null;
  const r = actor.actorRole.toUpperCase();
  if (r !== 'MANAGER' && r !== 'COORDINATOR') {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  if (!actor.actorDepartmentId) {
    return NextResponse.json(
      { success: false, message: 'You must belong to a department to manage budgets.' },
      { status: 400 }
    );
  }
  const target = await prisma.ticketRequester.findFirst({
    where: { id: targetStaffId, privateCompanyId: actor.companyId },
    select: { privateCompanyDepartmentId: true },
  });
  if (!target || target.privateCompanyDepartmentId !== actor.actorDepartmentId) {
    return NextResponse.json(
      { success: false, message: 'You can only set budgets for staff in your department.' },
      { status: 403 }
    );
  }
  return null;
}

async function movementSumForStaffMaterial(args: {
  companyId: string;
  staffId: string;
  materialId: string;
  type: 'USED' | 'DAMAGED' | 'LOST' | 'RETURNED';
}): Promise<number> {
  const fromKey =
    args.type === 'USED' ? { actorId: args.staffId } : { fromStaffId: args.staffId };
  const agg = await prisma.privateCompanyMaterialMovement.aggregate({
    where: {
      companyId: args.companyId,
      type: args.type,
      item: { materialId: args.materialId },
      ...fromKey,
    },
    _sum: { quantity: true },
  });
  return Math.max(0, Math.floor(Number(agg._sum?.quantity ?? 0) || 0));
}

/**
 * GET — list material budget lines for a workspace member (defaults to caller).
 *
 * Query: ?staffId=<requesterId>  (optional; requires visibility)
 *
 * POST — create or replace budget line (owner / manager / coordinator).
 * Body: { staffId, materialId, budgetQuantity, notes? }
 *
 * PATCH — update budget quantity / notes. Body: { id, budgetQuantity?, notes? }
 *
 * DELETE — ?id=budgetRowId
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const actor = toActor(guard);
  const { searchParams } = new URL(req.url);
  const rawStaffId = (searchParams.get('staffId') ?? '').trim();
  const targetStaffId = rawStaffId || guard.requesterId;
  if (!(await canViewStaffMaterialBudgets(actor, targetStaffId))) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  if (!(await assertStaffInCompany(guard.companyId, targetStaffId))) {
    return NextResponse.json({ success: false, message: 'Staff not in this workspace.' }, { status: 404 });
  }

  const budgets = await prisma.privateCompanyStaffMaterialBudget.findMany({
    where: { companyId: guard.companyId, staffRequesterId: targetStaffId },
    orderBy: { updatedAt: 'desc' },
    include: {
      material: { select: { id: true, name: true, unit: true, color: true } },
    },
  });

  const lines = await Promise.all(
    budgets.map(async (b: { id: string; budgetQuantity: number; notes: string | null; materialId: string; material: unknown }) => {
      const assignedQuantity = await sumAssignedQuantityForStaffMaterial({
        companyId: guard.companyId,
        staffId: targetStaffId,
        materialId: b.materialId,
      });
      const cap = Math.max(0, Math.floor(Number(b.budgetQuantity) || 0));
      const [usedLifetimeQuantity, damagedLifetime, lostLifetime, returnedLifetime] =
        await Promise.all([
          movementSumForStaffMaterial({
            companyId: guard.companyId,
            staffId: targetStaffId,
            materialId: b.materialId,
            type: 'USED',
          }),
          movementSumForStaffMaterial({
            companyId: guard.companyId,
            staffId: targetStaffId,
            materialId: b.materialId,
            type: 'DAMAGED',
          }),
          movementSumForStaffMaterial({
            companyId: guard.companyId,
            staffId: targetStaffId,
            materialId: b.materialId,
            type: 'LOST',
          }),
          movementSumForStaffMaterial({
            companyId: guard.companyId,
            staffId: targetStaffId,
            materialId: b.materialId,
            type: 'RETURNED',
          }),
        ]);
      return {
        id: b.id,
        staffRequesterId: targetStaffId,
        materialId: b.materialId,
        budgetQuantity: cap,
        notes: b.notes,
        material: b.material,
        assignedQuantity,
        usedLifetimeQuantity,
        damagedLifetime,
        lostLifetime,
        returnedLifetime,
        availableToAssign: Math.max(0, cap - assignedQuantity),
      };
    })
  );

  return NextResponse.json({ success: true, staffId: targetStaffId, budgets: lines });
}

export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const actor = toActor(guard);
  if (!canManageStaffMaterialBudgets(actor)) {
    return NextResponse.json(
      { success: false, message: 'Only the owner, a manager, or a coordinator can set budgets.' },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const staffId = typeof body?.staffId === 'string' ? body.staffId.trim() : '';
  const materialId = typeof body?.materialId === 'string' ? body.materialId.trim() : '';
  const budgetQtyRaw = body?.budgetQuantity;
  const budgetQuantity =
    typeof budgetQtyRaw === 'number' && budgetQtyRaw >= 0 ? Math.floor(budgetQtyRaw) : -1;
  const notes = typeof body?.notes === 'string' ? body.notes.trim() || null : null;

  if (!staffId || !materialId || budgetQuantity < 0) {
    return NextResponse.json(
      { success: false, message: 'staffId, materialId, and budgetQuantity are required.' },
      { status: 400 }
    );
  }
  if (!(await assertStaffInCompany(guard.companyId, staffId))) {
    return NextResponse.json({ success: false, message: 'Staff not in this workspace.' }, { status: 404 });
  }
  const deptErr = await assertManagerCanEditStaff(actor, staffId);
  if (deptErr) return deptErr;

  const material = await prisma.privateCompanyMaterial.findFirst({
    where: { id: materialId, companyId: guard.companyId },
    select: { id: true },
  });
  if (!material) {
    return NextResponse.json({ success: false, message: 'Material not found.' }, { status: 404 });
  }

  const assignedNow = await sumAssignedQuantityForStaffMaterial({
    companyId: guard.companyId,
    staffId,
    materialId,
  });
  if (budgetQuantity < assignedNow) {
    return NextResponse.json(
      {
        success: false,
        message: `Budget cannot be less than currently assigned quantity (${assignedNow}).`,
      },
      { status: 409 }
    );
  }

  const row = await prisma.privateCompanyStaffMaterialBudget.upsert({
    where: {
      companyId_staffRequesterId_materialId: {
        companyId: guard.companyId,
        staffRequesterId: staffId,
        materialId,
      },
    },
    create: {
      companyId: guard.companyId,
      staffRequesterId: staffId,
      materialId,
      budgetQuantity,
      notes,
    },
    update: { budgetQuantity, notes },
  });
  return NextResponse.json({ success: true, budget: row });
}

export async function PATCH(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const actor = toActor(guard);
  if (!canManageStaffMaterialBudgets(actor)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const existing = await prisma.privateCompanyStaffMaterialBudget.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, staffRequesterId: true, materialId: true, budgetQuantity: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  }
  const deptErr = await assertManagerCanEditStaff(actor, existing.staffRequesterId);
  if (deptErr) return deptErr;

  const data: Record<string, unknown> = {};
  if (typeof body?.budgetQuantity === 'number' && body.budgetQuantity >= 0) {
    data.budgetQuantity = Math.floor(body.budgetQuantity);
  }
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }
  if (typeof data.budgetQuantity === 'number') {
    const assignedNow = await sumAssignedQuantityForStaffMaterial({
      companyId: guard.companyId,
      staffId: existing.staffRequesterId,
      materialId: existing.materialId,
    });
    if (data.budgetQuantity < assignedNow) {
      return NextResponse.json(
        {
          success: false,
          message: `Budget cannot be less than currently assigned quantity (${assignedNow}).`,
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.privateCompanyStaffMaterialBudget.update({
    where: { id },
    data,
  });
  return NextResponse.json({ success: true, budget: updated });
}

export async function DELETE(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const actor = toActor(guard);
  if (!canManageStaffMaterialBudgets(actor)) {
    return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id.trim()) {
    return NextResponse.json({ success: false, message: 'id is required.' }, { status: 400 });
  }
  const existing = await prisma.privateCompanyStaffMaterialBudget.findFirst({
    where: { id: id.trim(), companyId: guard.companyId },
    select: { id: true, staffRequesterId: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });
  }
  const deptErr = await assertManagerCanEditStaff(actor, existing.staffRequesterId);
  if (deptErr) return deptErr;
  await prisma.privateCompanyStaffMaterialBudget.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
