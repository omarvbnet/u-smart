import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanManageDepartmentReasons,
  maintenanceReasonsGuard,
  normalizeMaintenanceReasonLabel,
  serializeMaintenanceReason,
} from '@/lib/private-company-maintenance-reasons';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function loadReason(id: string, companyId: string) {
  return prisma.privateCompanyMaintenanceReason.findFirst({
    where: { id, companyId },
  });
}

/**
 * PATCH /api/provisor-private-company/maintenance-reasons/[id]
 * Body: { label?, sortOrder?, active? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await loadReason(id, guard.companyId);
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Reason not found.' }, { status: 404 });
  }

  const denied = assertCanManageDepartmentReasons(guard, existing.departmentId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = normalizeMaintenanceReasonLabel(body.label);
    if (!label) {
      return NextResponse.json({ success: false, message: 'Invalid label.' }, { status: 400 });
    }
    data.label = label;
  }
  if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.floor(body.sortOrder);
  }
  if (typeof body.active === 'boolean') {
    data.active = body.active;
  }

  try {
    const row = await prisma.privateCompanyMaintenanceReason.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, reason: serializeMaintenanceReason(row) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('Unique constraint')) {
      return NextResponse.json(
        { success: false, message: 'This reason already exists for the department.' },
        { status: 409 }
      );
    }
    throw e;
  }
}

/** DELETE — soft-deactivate (keeps analytics history on tickets). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const existing = await loadReason(id, guard.companyId);
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Reason not found.' }, { status: 404 });
  }

  const denied = assertCanManageDepartmentReasons(guard, existing.departmentId);
  if (denied) return denied;

  const row = await prisma.privateCompanyMaintenanceReason.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ success: true, reason: serializeMaintenanceReason(row) });
}
