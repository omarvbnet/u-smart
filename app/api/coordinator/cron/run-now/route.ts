import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';

/**
 * Run task generation now from job duty templates (current company only).
 * Does not check cron schedule – creates one task per template. ADMIN only.
 */
function dueFromFrequency(frequency: string): Date {
  const d = new Date();
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 1);
  }
  return d;
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);

    const templates = await prisma.coordinatorJobDutyTemplate.findMany({
      where: { companyId: payload.companyId },
      include: { company: { include: { users: { where: { role: 'ADMIN' }, take: 1 } } } },
    });

    const created: string[] = [];

    for (const t of templates) {
      const creatorId = t.company.users[0]?.id ?? payload.sub;
      const tt = t.taskTemplate as { title?: string; description?: string; checklist?: unknown } | null;
      const title = (tt?.title as string) || t.name;
      const description = (tt?.description as string) || null;
      const checklist = tt?.checklist ?? undefined;

      const task = await prisma.coordinatorTask.create({
        data: {
          title,
          description,
          status: CoordinatorTaskStatus.PENDING,
          companyId: t.companyId,
          createdById: creatorId,
          dueAt: dueFromFrequency(t.frequency),
          checklist: checklist ?? undefined,
          fileUrls: [],
        },
      });
      created.push(task.id);
    }

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'cron_run_now',
      resource: 'job_duty',
      resourceId: '',
      payload: { generated: created.length, taskIds: created },
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true, generated: created.length, taskIds: created });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/cron/run-now:', e);
    return NextResponse.json({ success: false, message: 'Generation failed' }, { status: 500 });
  }
}
