import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { createCoordinatorNotification } from '@/lib/coordinator/notifications';
import { buildCompanyContext, contextToPromptText } from '@/lib/coordinator/ai-context';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';
import OpenAI from 'openai';

const VALID_STATUSES = Object.values(CoordinatorTaskStatus);

async function resolveTaskId(taskIdRef: string, companyId: string): Promise<string | null> {
  if (taskIdRef.length >= 20) {
    const t = await prisma.coordinatorTask.findFirst({ where: { id: taskIdRef, companyId }, select: { id: true } });
    return t?.id ?? null;
  }
  const tasks = await prisma.coordinatorTask.findMany({ where: { companyId }, select: { id: true } });
  const match = tasks.find((t) => t.id === taskIdRef || t.id.endsWith(taskIdRef) || t.id.slice(-6).toUpperCase() === taskIdRef.toUpperCase());
  return match?.id ?? null;
}

/**
 * POST: AI full control. Body: { command: string } (e.g. "أنشئ مهمة لطلب العميل الاتصال بأحمد، واكتمل المهمة #ABC123").
 * AI returns actions: create_task, update_task, escalate. We execute them.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json().catch(() => ({}));
    const command = typeof body.command === 'string' ? body.command.trim() : '';
    if (!command) {
      return NextResponse.json({ success: false, message: 'command is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'OPENAI_API_KEY not set' }, { status: 503 });
    }

    const ctx = await buildCompanyContext(payload.companyId);
    const contextText = contextToPromptText(ctx);

    const openai = new OpenAI({ apiKey });
    const systemPrompt = `You are an AI coordinator with FULL CONTROL. You can CREATE tasks, UPDATE task status/feedback, ESCALATE tasks.
Given the user command and company data, output a JSON object with an "actions" array. Each action:
- create_task: {"action":"create_task","title":"...","description":"...","priority":"normal|high|urgent"}
- update_task: {"action":"update_task","taskId":"full id or last 6 chars","status":"PENDING|IN_PROGRESS|COMPLETED|...","coordinatorFeedback":"optional"}
- escalate: {"action":"escalate","taskId":"...","reason":"optional"}

Output only: {"actions":[ {...}, {...} ]}
Use taskId from recent tasks (id or last 6 chars). Status must be one of: ${VALID_STATUSES.join(', ')}.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Company data:\n${contextText}\n\nUser command: ${command}\n\nOutput JSON with "actions" array only.` },
      ],
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let actions: Array<{ action: string; title?: string; description?: string; priority?: string; taskId?: string; status?: string; coordinatorFeedback?: string; reason?: string }> = [];
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      if (Array.isArray(parsed.actions)) actions = parsed.actions;
    } catch {
      // ignore
    }

    const results: Array<{ action: string; success: boolean; taskId?: string; message?: string }> = [];

    for (const a of actions) {
      if (a.action === 'create_task' && typeof a.title === 'string' && a.title.trim()) {
        const task = await prisma.coordinatorTask.create({
          data: {
            title: a.title.trim().slice(0, 500),
            description: (a.description && String(a.description).trim().slice(0, 5000)) || null,
            status: CoordinatorTaskStatus.PENDING,
            companyId: payload.companyId,
            createdById: payload.sub,
            source: 'manual',
            priority: ['normal', 'high', 'urgent'].includes(a.priority ?? '') ? a.priority! : undefined,
          },
        });
        results.push({ action: 'create_task', success: true, taskId: task.id });
        await logAudit({ companyId: payload.companyId, userId: payload.sub, action: 'task_create', resource: 'task', resourceId: task.id, payload: { title: task.title, fromAiExecute: true }, ip: getClientIp(req) });
        continue;
      }

      if ((a.action === 'update_task' || a.action === 'escalate') && a.taskId) {
        const taskId = await resolveTaskId(String(a.taskId).trim(), payload.companyId);
        if (!taskId) {
          results.push({ action: a.action, success: false, taskId: a.taskId, message: 'Task not found' });
          continue;
        }
        const task = await prisma.coordinatorTask.findFirst({ where: { id: taskId, companyId: payload.companyId } });
        if (!task) {
          results.push({ action: a.action, success: false, taskId, message: 'Task not found' });
          continue;
        }

        if (a.action === 'update_task') {
          const data: { status?: CoordinatorTaskStatus; completedAt?: Date; coordinatorFeedback?: string; priority?: string } = {};
          if (a.status && VALID_STATUSES.includes(a.status as CoordinatorTaskStatus)) {
            data.status = a.status as CoordinatorTaskStatus;
            if (data.status === CoordinatorTaskStatus.COMPLETED) data.completedAt = new Date();
          }
          if (typeof a.coordinatorFeedback === 'string' && a.coordinatorFeedback.trim()) data.coordinatorFeedback = a.coordinatorFeedback.trim();
          if (['normal', 'high', 'urgent'].includes(a.priority ?? '')) data.priority = a.priority!;
          if (Object.keys(data).length > 0) {
            await prisma.coordinatorTask.update({ where: { id: taskId }, data });
            results.push({ action: 'update_task', success: true, taskId });
            await logAudit({ companyId: payload.companyId, userId: payload.sub, action: 'task_update', resource: 'task', resourceId: taskId, payload: data, ip: getClientIp(req) });
          }
        }

        if (a.action === 'escalate') {
          await prisma.coordinatorTask.update({ where: { id: taskId }, data: { priority: 'urgent' } });
          const admins = await prisma.coordinatorUser.findMany({ where: { companyId: payload.companyId, role: CoordinatorRole.ADMIN }, select: { id: true } });
          const reason = typeof a.reason === 'string' ? a.reason.trim() : '';
          for (const admin of admins) {
            await createCoordinatorNotification({
              userId: admin.id,
              title: 'تصعيد مهمة عاجل',
              body: reason ? `${task.title} — ${reason}` : task.title,
              channel: 'in_app',
              linkUrl: `/coordinator/tasks/${taskId}`,
            }).catch(() => {});
          }
          results.push({ action: 'escalate', success: true, taskId });
          await logAudit({ companyId: payload.companyId, userId: payload.sub, action: 'task_escalate', resource: 'task', resourceId: taskId, payload: { reason: reason || undefined }, ip: getClientIp(req) });
        }
      }
    }

    return NextResponse.json({ success: true, executed: results.length, results });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/ai/execute:', e);
    return NextResponse.json({ success: false, message: 'Execute failed' }, { status: 500 });
  }
}
