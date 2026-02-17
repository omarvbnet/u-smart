import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { buildCompanyContext, contextToPromptText } from '@/lib/coordinator/ai-context';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';
import OpenAI from 'openai';
import twilio from 'twilio';

const VALID_STATUSES = Object.values(CoordinatorTaskStatus);

/**
 * AI coordinator agent: analyze task + feedback, suggest status, generate reply for requester.
 * - Updates task status from AI suggestion
 * - Sends AI-generated reply to WhatsApp sender if inboundReplyTo is set
 * Requires OPENAI_API_KEY. Scope: act as coordinator (manage status, reply to requests).
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
      include: { createdBy: { select: { name: true, email: true } } },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const feedback = task.coordinatorFeedback?.trim() ?? '';
    if (feedback.length < 3) {
      return NextResponse.json(
        { success: false, message: 'أضف التغذية الراجعة أولاً لمعالجة المهمة بالذكاء الاصطناعي.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'AI coordinator not configured. Set OPENAI_API_KEY.' },
        { status: 503 }
      );
    }

    const [openai, ctx] = await Promise.all([
      Promise.resolve(new OpenAI({ apiKey })),
      buildCompanyContext(payload.companyId),
    ]);
    const contextText = contextToPromptText(ctx);

    const systemPrompt = `You are an AI coordinator agent with access to the full company data. Given the current task and the coordinator's feedback (actual outcome), you must:
1. Suggest the appropriate task status based on the feedback. Status must be exactly one of: ${VALID_STATUSES.join(', ')}. Use COMPLETED when the matter is resolved, IN_PROGRESS when follow-up is ongoing, PENDING when waiting, UNDER_REVIEW when needs review.
2. Write a short, professional reply in Arabic to send to the person who requested this (e.g. via WhatsApp). The reply should summarize the outcome and be friendly and clear. Do not expose internal details.
3. Optionally add "feedback" (string): a brief note or recommendation in Arabic based on the rest of the company data (e.g. other tasks, KPIs, priorities). Leave empty if not needed.

Respond with a single JSON object only, no other text:
{"suggested_status":"STATUS","reply_message":"النص بالعربية","feedback":"ملاحظة اختيارية أو توصية"}`;

    const userContent = `Company data (for context):\n${contextText}\n\n---\nCurrent task:\nTitle: ${task.title}
${task.description ? `Description: ${task.description}` : ''}
Current status: ${task.status}
Coordinator feedback (actual outcome): ${feedback}

Output JSON with suggested_status, reply_message, and optional feedback.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    let suggestedStatus: CoordinatorTaskStatus | null = null;
    let replyMessage: string | null = null;
    let feedbackNote: string | null = null;

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      if (VALID_STATUSES.includes(parsed.suggested_status)) {
        suggestedStatus = parsed.suggested_status as CoordinatorTaskStatus;
      }
      if (typeof parsed.reply_message === 'string' && parsed.reply_message.trim()) {
        replyMessage = parsed.reply_message.trim();
      }
      if (typeof parsed.feedback === 'string' && parsed.feedback.trim()) {
        feedbackNote = parsed.feedback.trim();
      }
    } catch {
      // fallback: try to extract status and message from raw text
      for (const s of VALID_STATUSES) {
        if (raw.includes(s)) {
          suggestedStatus = s;
          break;
        }
      }
    }

    let statusUpdated = false;
    if (suggestedStatus && suggestedStatus !== task.status) {
      await prisma.coordinatorTask.update({
        where: { id },
        data: {
          status: suggestedStatus,
          ...(suggestedStatus === CoordinatorTaskStatus.COMPLETED ? { completedAt: new Date() } : {}),
        },
      });
      statusUpdated = true;
    }

    let replySent = false;
    const replyTo = task.inboundReplyTo?.trim();
    const canSendWhatsApp =
      replyMessage &&
      replyTo &&
      /^whatsapp:\+[0-9]{10,15}$/.test(replyTo);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;

    if (canSendWhatsApp && accountSid && authToken && from) {
      try {
        const client = twilio(accountSid, authToken);
        const ref = task.id.slice(-6).toUpperCase();
        const bodyWithRef = `[متابعة #${ref}]\n${replyMessage}`.slice(0, 4096);
        await client.messages.create({
          from,
          to: replyTo,
          body: bodyWithRef,
        });
        replySent = true;
      } catch (sendErr) {
        console.error('AI process: send WhatsApp reply:', sendErr);
      }
    }

    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'task_ai_process',
      resource: 'task',
      resourceId: id,
      payload: { suggestedStatus, statusUpdated, replySent },
      ip: getClientIp(req),
    });

    const updated = await prisma.coordinatorTask.findFirst({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } }, subTasks: true },
    });

    return NextResponse.json({
      success: true,
      task: updated,
      suggestedStatus: suggestedStatus ?? task.status,
      statusUpdated,
      replySent,
      replyMessage: replyMessage ?? undefined,
      feedback: feedbackNote ?? undefined,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/tasks/[id]/ai-process:', e);
    return NextResponse.json({ success: false, message: 'AI process failed' }, { status: 500 });
  }
}
