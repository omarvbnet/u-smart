import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole, CoordinatorTaskStatus, Prisma } from '@prisma/client';

async function getTaskAndCheckCompany(
  taskId: string,
  companyId: string
) {
  const task = await prisma.coordinatorTask.findFirst({
    where: { id: taskId, companyId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      subTasks: true,
      comments: true,
    },
  });
  return task;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { id } = await params;
    const task = await getTaskAndCheckCompany(id, payload.companyId);
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, task });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/tasks/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const task = await getTaskAndCheckCompany(id, payload.companyId);
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const body = await req.json();
    const data: {
      title?: string;
      description?: string | null;
      status?: CoordinatorTaskStatus;
      dueAt?: Date | null;
      completedAt?: Date | null;
      checklist?: Prisma.InputJsonValue;
      fileUrls?: string[];
      coordinatorFeedback?: string | null;
      priority?: string | null;
    } = {};

    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === 'string') data.description = body.description.trim() || null;
    if (body.status && Object.values(CoordinatorTaskStatus).includes(body.status)) {
      data.status = body.status;
      if (body.status === CoordinatorTaskStatus.COMPLETED) {
        data.completedAt = new Date();
      }
    }
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (Array.isArray(body.checklist)) data.checklist = body.checklist as Prisma.InputJsonValue;
    if (Array.isArray(body.fileUrls)) data.fileUrls = body.fileUrls;
    if (typeof body.coordinatorFeedback === 'string') data.coordinatorFeedback = body.coordinatorFeedback.trim() || null;
    if (['normal', 'high', 'urgent'].includes(body.priority)) data.priority = body.priority;

    const updated = await prisma.coordinatorTask.update({
      where: { id },
      data,
      include: { createdBy: { select: { id: true, name: true, email: true } }, subTasks: true },
    });

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_update',
      resource: 'task',
      resourceId: id,
      payload: data,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true, task: updated });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/tasks/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const task = await getTaskAndCheckCompany(id, payload.companyId);
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    await prisma.coordinatorTask.delete({ where: { id } });

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_delete',
      resource: 'task',
      resourceId: id,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/tasks/[id]:', e);
    return NextResponse.json({ success: false, message: 'Failed to delete task' }, { status: 500 });
  }
}
