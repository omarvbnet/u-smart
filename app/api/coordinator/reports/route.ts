import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || undefined;

    const where: { companyId: string; type?: string } = { companyId: payload.companyId };
    if (type) where.type = type;

    const reports = await prisma.coordinatorReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ success: true, reports });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/reports:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const type = typeof body.type === 'string' ? body.type : 'custom';
    const periodFrom = body.periodFrom ? new Date(body.periodFrom) : new Date();
    const periodTo = body.periodTo ? new Date(body.periodTo) : new Date();

    if (!title) {
      return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });
    }

    const report = await prisma.coordinatorReport.create({
      data: {
        title,
        type: ['daily', 'weekly', 'monthly', 'custom'].includes(type) ? type : 'custom',
        companyId: payload.companyId,
        periodFrom,
        periodTo,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'report_create',
      resource: 'report',
      resourceId: report.id,
      payload: { title: report.title, type: report.type },
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, report });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/reports:', e);
    return NextResponse.json({ success: false, message: 'Failed to create report' }, { status: 500 });
  }
}
