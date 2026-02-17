import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { createCoordinatorNotification } from '@/lib/coordinator/notifications';
import { buildCompanyContext, contextToPromptText } from '@/lib/coordinator/ai-context';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';
import OpenAI from 'openai';

/**
 * POST: AI creates a task from a customer request. Body: { request: string }.
 * AI suggests title, description, priority from request + company context. Full control to add task.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json().catch(() => ({}));
    const requestText = typeof body.request === 'string' ? body.request.trim() : '';
    if (!requestText) {
      return NextResponse.json({ success: false, message: 'request is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, message: 'OPENAI_API_KEY not set' }, { status: 503 });
    }

    const ctx = await buildCompanyContext(payload.companyId);
    const contextText = contextToPromptText(ctx);

    const openai = new OpenAI({ apiKey });
    const systemPrompt = `You are an AI coordinator with full control. You can CREATE tasks from customer requests.
Given the customer request and company context, output a single JSON object:
{"title":"عنوان المهمة بالعربية","description":"وصف تفصيلي أو null","priority":"normal|high|urgent"}
Title is required. Use priority "urgent" for time-sensitive requests, "high" for important, "normal" otherwise.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Company context:\n${contextText}\n\nCustomer request: ${requestText}\n\nOutput JSON only.` },
      ],
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let title = '';
    let description: string | null = null;
    let priority = 'normal';
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      if (typeof parsed.title === 'string' && parsed.title.trim()) title = parsed.title.trim();
      if (typeof parsed.description === 'string' && parsed.description.trim()) description = parsed.description.trim();
      if (['normal', 'high', 'urgent'].includes(parsed.priority)) priority = parsed.priority;
    } catch {
      title = requestText.slice(0, 200);
    }
    if (!title) title = requestText.slice(0, 200) || 'مهمة من طلب العميل';

    const task = await prisma.coordinatorTask.create({
      data: {
        title: title.slice(0, 500),
        description: description ? description.slice(0, 5000) : null,
        status: CoordinatorTaskStatus.PENDING,
        companyId: payload.companyId,
        createdById: payload.sub,
        source: 'manual',
        priority,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true } },
      },
    });

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_create',
      resource: 'task',
      resourceId: task.id,
      payload: { title: task.title, fromAi: true },
      ip: getClientIp(req),
    });

    await createCoordinatorNotification({
      userId: payload.sub,
      title: 'تم إنشاء مهمة جديدة (من طلب العميل)',
      body: task.title,
      channel: 'in_app',
      linkUrl: `/coordinator/tasks/${task.id}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, task });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/ai/create-task:', e);
    return NextResponse.json({ success: false, message: 'Create task failed' }, { status: 500 });
  }
}
