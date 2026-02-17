import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { runAiProcessForTask } from '@/lib/coordinator/ai-task-process';
import { CoordinatorRole } from '@prisma/client';

/**
 * POST: Run AI process for this task (manual trigger). Also runs automatically when feedback is saved (PATCH).
 * Updates status, sends WhatsApp reply, sets aiProcessedAt. No human required for automation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const task = await prisma.coordinatorTask.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }
    const feedback = task.coordinatorFeedback?.trim() ?? '';
    if (feedback.length < 3) {
      return NextResponse.json(
        { success: false, message: 'أضف التغذية الراجعة أولاً.' },
        { status: 400 }
      );
    }

    const result = await runAiProcessForTask(id, payload.companyId);

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_ai_process',
      resource: 'task',
      resourceId: id,
      payload: { suggestedStatus: result.suggestedStatus, statusUpdated: result.statusUpdated, replySent: result.replySent },
      ip: getClientIp(req),
    });

    const updated = await prisma.coordinatorTask.findFirst({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } }, subTasks: true },
    });

    return NextResponse.json({
      success: result.success,
      task: updated,
      suggestedStatus: result.suggestedStatus,
      statusUpdated: result.statusUpdated,
      replySent: result.replySent,
      replyMessage: result.replyMessage ?? undefined,
      feedback: result.feedback ?? undefined,
      error: result.error,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/tasks/[id]/ai-process:', e);
    return NextResponse.json({ success: false, message: 'AI process failed' }, { status: 500 });
  }
}
