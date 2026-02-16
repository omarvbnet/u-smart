import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as CoordinatorTaskStatus | null;

    const where: { companyId: string; status?: CoordinatorTaskStatus } = { companyId: payload.companyId };
    if (status && Object.values(CoordinatorTaskStatus).includes(status)) {
      where.status = status;
    }

    const tasks = await prisma.coordinatorTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        subTasks: true,
        _count: { select: { comments: true } },
      },
    });

    return NextResponse.json({ success: true, tasks });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/tasks:', e);
    return NextResponse.json({ success: false, message: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });
    }

    const task = await prisma.coordinatorTask.create({
      data: {
        title,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        status: CoordinatorTaskStatus.PENDING,
        companyId: payload.companyId,
        createdById: payload.sub,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        checklist: Array.isArray(body.checklist) ? body.checklist : undefined,
        fileUrls: Array.isArray(body.fileUrls) ? body.fileUrls : [],
      },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_create',
      resource: 'task',
      resourceId: task.id,
      payload: { title: task.title },
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true, task });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/tasks:', e);
    return NextResponse.json({ success: false, message: 'Failed to create task' }, { status: 500 });
  }
}
