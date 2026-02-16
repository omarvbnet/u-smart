import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { computeKPIStatus } from '@/lib/coordinator/kpi';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole, KPIStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const kpis = await prisma.coordinatorKPI.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, kpis });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/kpis:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch KPIs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const targetValue = typeof body.targetValue === 'number' ? body.targetValue : Number(body.targetValue) || 0;
    const actualValue = typeof body.actualValue === 'number' ? body.actualValue : Number(body.actualValue) || 0;
    const unit = typeof body.unit === 'string' ? body.unit.trim() || null : null;

    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }

    const status = computeKPIStatus(actualValue, targetValue);

    const kpi = await prisma.coordinatorKPI.create({
      data: {
        name,
        targetValue,
        actualValue,
        unit,
        status,
        companyId: payload.companyId,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'kpi_create',
      resource: 'kpi',
      resourceId: kpi.id,
      payload: { name: kpi.name },
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, kpi });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/kpis:', e);
    return NextResponse.json({ success: false, message: 'Failed to create KPI' }, { status: 500 });
  }
}
