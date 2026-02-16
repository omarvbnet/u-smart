import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorJobDutyTemplate.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    }

    const body = await req.json();
    const data: { name?: string; cron?: string; frequency?: string; taskTemplate?: unknown } = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.cron === 'string') data.cron = body.cron.trim() || existing.cron;
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(body.frequency)) data.frequency = body.frequency;
    if (body.taskTemplate && typeof body.taskTemplate === 'object') data.taskTemplate = body.taskTemplate;

    const template = await prisma.coordinatorJobDutyTemplate.update({
      where: { id },
      data,
    });
    return NextResponse.json({ success: true, template });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/job-duties/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(_req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorJobDutyTemplate.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
    }
    await prisma.coordinatorJobDutyTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/job-duties/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete template' }, { status: 500 });
  }
}
