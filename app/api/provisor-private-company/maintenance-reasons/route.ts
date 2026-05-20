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

/**
 * GET /api/provisor-private-company/maintenance-reasons?departmentId=
 * Owner: optional department filter (all if omitted). Manager/coordinator: own department only.
 */
export async function GET(req: NextRequest) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  let departmentId = url.searchParams.get('departmentId')?.trim() || null;
  const includeInactive = url.searchParams.get('includeInactive') === '1';

  if (!guard.isOwner) {
    departmentId = guard.actorDepartmentId;
  } else if (!departmentId) {
    const rows = await prisma.privateCompanyMaintenanceReason.findMany({
      where: {
        companyId: guard.companyId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        department: { select: { id: true, name: true, color: true } },
      },
    });
    return NextResponse.json({
      success: true,
      reasons: rows.map((r: Record<string, unknown>) => ({
        ...serializeMaintenanceReason(r as Parameters<typeof serializeMaintenanceReason>[0]),
        departmentName: (r.department as { name?: string })?.name ?? null,
        departmentColor: (r.department as { color?: string })?.color ?? null,
      })),
    });
  }

  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id: departmentId, companyId: guard.companyId },
    select: { id: true },
  });
  if (!dept) {
    return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  }
  const denied = assertCanManageDepartmentReasons(guard, departmentId);
  if (denied) return denied;

  const rows = await prisma.privateCompanyMaintenanceReason.findMany({
    where: {
      companyId: guard.companyId,
      departmentId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });

  return NextResponse.json({
    success: true,
    departmentId,
    reasons: rows.map(serializeMaintenanceReason),
  });
}

/**
 * POST /api/provisor-private-company/maintenance-reasons
 * Body: { departmentId, label, sortOrder? }
 */
export async function POST(req: NextRequest) {
  const guard = await maintenanceReasonsGuard(req);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const departmentId = typeof body.departmentId === 'string' ? body.departmentId.trim() : '';
  const label = normalizeMaintenanceReasonLabel(body.label);
  if (!departmentId || !label) {
    return NextResponse.json(
      { success: false, message: 'departmentId and label are required.' },
      { status: 400 }
    );
  }

  const denied = assertCanManageDepartmentReasons(guard, departmentId);
  if (denied) return denied;

  const dept = await prisma.privateCompanyDepartment.findFirst({
    where: { id: departmentId, companyId: guard.companyId },
    select: { id: true },
  });
  if (!dept) {
    return NextResponse.json({ success: false, message: 'Department not found.' }, { status: 404 });
  }

  const sortOrder =
    typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.floor(body.sortOrder)
      : 0;

  try {
    const row = await prisma.privateCompanyMaintenanceReason.create({
      data: {
        companyId: guard.companyId,
        departmentId,
        label,
        sortOrder,
        active: true,
      },
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
