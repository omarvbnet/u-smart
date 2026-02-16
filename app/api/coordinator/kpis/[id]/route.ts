import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { computeKPIStatus } from '@/lib/coordinator/kpi';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorKPI.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'KPI not found' }, { status: 404 });
    }

    const body = await req.json();
    let targetValue = existing.targetValue;
    let actualValue = existing.actualValue;
    if (typeof body.targetValue === 'number') targetValue = body.targetValue;
    else if (typeof body.targetValue === 'string') targetValue = parseFloat(body.targetValue) ?? targetValue;
    if (typeof body.actualValue === 'number') actualValue = body.actualValue;
    else if (typeof body.actualValue === 'string') actualValue = parseFloat(body.actualValue) ?? actualValue;

    const status = computeKPIStatus(actualValue, targetValue);

    const kpi = await prisma.coordinatorKPI.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim() && { name: body.name.trim() }),
        targetValue,
        actualValue,
        status,
        reportedAt: body.reportedAt ? new Date(body.reportedAt) : existing.reportedAt,
        ...(typeof body.unit === 'string' && { unit: body.unit.trim() || null }),
      },
    });
    return NextResponse.json({ success: true, kpi });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/kpis/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update KPI' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(_req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorKPI.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'KPI not found' }, { status: 404 });
    }
    await prisma.coordinatorKPI.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/kpis/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete KPI' }, { status: 500 });
  }
}
