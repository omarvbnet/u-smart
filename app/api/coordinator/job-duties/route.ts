import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const templates = await prisma.coordinatorJobDutyTemplate.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, templates });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/job-duties:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const frequency = typeof body.frequency === 'string' ? body.frequency : 'daily';
    const cron = typeof body.cron === 'string' ? body.cron.trim() : '';
    const taskTemplate = body.taskTemplate && typeof body.taskTemplate === 'object' ? body.taskTemplate : { title: name, description: '' };

    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }

    const validFreq = ['daily', 'weekly', 'monthly', 'yearly'];
    const freq = validFreq.includes(frequency) ? frequency : 'daily';
    const cronExpr = cron || (freq === 'daily' ? '0 9 * * *' : freq === 'weekly' ? '0 9 * * 0' : freq === 'monthly' ? '0 9 1 * *' : '0 9 1 1 *');

    const template = await prisma.coordinatorJobDutyTemplate.create({
      data: {
        name,
        cron: cronExpr,
        frequency: freq,
        companyId: payload.companyId,
        taskTemplate,
      },
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'job_duty_create',
      resource: 'job_duty',
      resourceId: template.id,
      payload: { name: template.name },
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, template });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/job-duties:', e);
    return NextResponse.json({ success: false, message: 'Failed to create template' }, { status: 500 });
  }
}
