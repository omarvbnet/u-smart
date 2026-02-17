import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { createCoordinatorNotification } from '@/lib/coordinator/notifications';
import { CoordinatorRole } from '@prisma/client';

/**
 * POST: Escalate task (set priority to urgent, notify all company admins).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

    const task = await prisma.coordinatorTask.findFirst({
      where: { id, companyId: payload.companyId },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    await prisma.coordinatorTask.update({
      where: { id },
      data: { priority: 'urgent' },
    });

    const admins = await prisma.coordinatorUser.findMany({
      where: { companyId: payload.companyId, role: CoordinatorRole.ADMIN },
      select: { id: true },
    });
    const title = 'تصعيد مهمة عاجل';
    const bodyText = reason
      ? `${task.title} — السبب: ${reason}`
      : `تم تصعيد المهمة: ${task.title}`;
    for (const admin of admins) {
      await createCoordinatorNotification({
        userId: admin.id,
        title,
        body: bodyText,
        channel: 'in_app',
        linkUrl: `/coordinator/tasks/${id}`,
      }).catch(() => {});
    }

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_escalate',
      resource: 'task',
      resourceId: id,
      payload: { title: task.title, reason: reason ?? undefined },
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true, message: 'Task escalated' });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/tasks/[id]/escalate:', e);
    return NextResponse.json({ success: false, message: 'Escalation failed' }, { status: 500 });
  }
}
