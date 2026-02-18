import { prisma } from '@/lib/prisma';
import { buildCompanyContext, contextToPromptText } from '@/lib/coordinator/ai-context';
import { CoordinatorTaskStatus } from '@prisma/client';
import OpenAI from 'openai';
import twilio from 'twilio';

const VALID_STATUSES = Object.values(CoordinatorTaskStatus);

export type AiProcessResult = {
  success: boolean;
  suggestedStatus: CoordinatorTaskStatus | null;
  statusUpdated: boolean;
  replySent: boolean;
  replyMessage: string | null;
  feedback: string | null;
  error?: string;
};

/** Run AI process for task: read context, suggest status, send WhatsApp, set aiProcessedAt. No human required. */
export async function runAiProcessForTask(taskId: string, companyId: string): Promise<AiProcessResult> {
  const task = await prisma.coordinatorTask.findFirst({ where: { id: taskId, companyId } });
  if (!task) return { success: false, suggestedStatus: null, statusUpdated: false, replySent: false, replyMessage: null, feedback: null, error: 'Task not found' };

  const feedback = task.coordinatorFeedback?.trim() ?? '';
  if (feedback.length < 3) return { success: false, suggestedStatus: null, statusUpdated: false, replySent: false, replyMessage: null, feedback: null, error: 'No feedback' };

  if (!process.env.OPENAI_API_KEY) return { success: false, suggestedStatus: null, statusUpdated: false, replySent: false, replyMessage: null, feedback: null, error: 'OPENAI_API_KEY not set' };

  if (/^تم استلام رسالة واتساب — .+ بانتظار المتابعة/.test(feedback)) return { success: true, suggestedStatus: null, statusUpdated: false, replySent: false, replyMessage: null, feedback: null };

  const [openai, ctx] = await Promise.all([Promise.resolve(new OpenAI({ apiKey: process.env.OPENAI_API_KEY })), buildCompanyContext(companyId)]);
  const contextText = contextToPromptText(ctx);

  const systemPrompt = `You are an autonomous AI coordinator. You READ: tasks, KPIs, reports, audit, voice, job duties, social. You WRITE: task status (one of ${VALID_STATUSES.join(', ')}), reply_message (Arabic, to send via WhatsApp). Output JSON only: {"suggested_status":"STATUS","reply_message":"النص","feedback":"optional note"}`;
  const userContent = `Company data:\n${contextText}\n\n---\nTask: ${task.title}\n${task.description || ''}\nStatus: ${task.status}\nCoordinator feedback: ${feedback}\n\nOutput JSON.`;

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }], max_tokens: 400 });
    raw = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    console.error('runAiProcessForTask OpenAI:', e);
    return { success: false, suggestedStatus: null, statusUpdated: false, replySent: false, replyMessage: null, feedback: null, error: String(e) };
  }

  let suggestedStatus: CoordinatorTaskStatus | null = null;
  let replyMessage: string | null = null;
  let feedbackNote: string | null = null;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    if (VALID_STATUSES.includes(parsed.suggested_status)) suggestedStatus = parsed.suggested_status;
    if (typeof parsed.reply_message === 'string' && parsed.reply_message.trim()) replyMessage = parsed.reply_message.trim();
    if (typeof parsed.feedback === 'string' && parsed.feedback.trim()) feedbackNote = parsed.feedback.trim();
  } catch {
    for (const s of VALID_STATUSES) { if (raw.includes(s)) { suggestedStatus = s; break; } }
  }

  if (suggestedStatus && suggestedStatus !== task.status) {
    await prisma.coordinatorTask.update({
      where: { id: taskId },
      data: { status: suggestedStatus, ...(suggestedStatus === CoordinatorTaskStatus.COMPLETED ? { completedAt: new Date() } : {}) },
    });
  }

  let replySent = false;
  const replyTo = task.inboundReplyTo?.trim();
  if (replyMessage && replyTo && /^whatsapp:\+[0-9]{10,15}$/.test(replyTo)) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (accountSid && authToken && from) {
      try {
        await twilio(accountSid, authToken).messages.create({
          from, to: replyTo, body: `[متابعة #${task.id.slice(-6).toUpperCase()}]\n${replyMessage}`.slice(0, 4096),
        });
        replySent = true;
      } catch (sendErr) {
        console.error('runAiProcessForTask WhatsApp:', sendErr);
      }
    }
  }

  await prisma.coordinatorTask.update({ where: { id: taskId }, data: { aiProcessedAt: new Date() } });

  return { success: true, suggestedStatus: suggestedStatus ?? task.status, statusUpdated: !!(suggestedStatus && suggestedStatus !== task.status), replySent, replyMessage, feedback: feedbackNote };
}

export type InboundAiActionResult = {
  reply: string;
  sendWhatsAppTo?: { phone: string; body: string };
  askForNumber?: string;
  createTask?: { title: string; description?: string };
  updateTask?: { taskRef: string; status?: string; feedback?: string };
};

/**
 * Generate AI reply and actions for inbound WhatsApp. AI can: answer questions, send WhatsApp to contacts,
 * ask for number if contact unknown, create/update tasks. No human required.
 */
export async function generateAiReplyForInboundMessage(
  companyId: string,
  messageText: string,
  taskRef: string,
  options?: { taskId?: string; adminId?: string }
): Promise<InboundAiActionResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const [openai, ctx] = await Promise.all([
    Promise.resolve(new OpenAI({ apiKey: process.env.OPENAI_API_KEY })),
    buildCompanyContext(companyId),
  ]);
  const contextText = contextToPromptText(ctx);

  const systemPrompt = `You are an autonomous AI coordinator with FULL CONTROL. You can:
- Answer questions directly from company data (tasks, KPIs, reports, contacts)
- SEND WhatsApp to a contact when request is "call X" / "راسل X" / "أتصل بـ X" — use contacts list for phone
- ASK for phone if someone is requested but NOT in contacts — set ask_for_number and reply with "رقم X غير متوفر. يرجى إرسال رقمه للتواصل."
- CREATE or UPDATE tasks

Output JSON only. Include only fields you need:
{"reply":"Arabic reply, start with [متابعة #${taskRef}]","send_whatsapp":{"phone":"+9647712345678","body":"رسالة"},"ask_for_number":"أحمد","create_task":{"title":"...","description":"..."},"update_task":{"task_ref":"ABC123","status":"COMPLETED","feedback":"..."}}

RULES:
1. "call Ahmed" / "أتصل بأحمد" / "راسل أحمد" → check contacts. If found: set send_whatsapp with that phone and body. If NOT: set ask_for_number "أحمد", reply must say "رقم أحمد غير متوفر. يرجى إرسال رقمه للتواصل."
2. send_whatsapp phone = E.164 from contacts OR from inbound (e.g. task #ABC123's number). body = message to send.
3. reply is always required. Answer directly, never generic "قيد المعالجة".`;

  const userContent = `Company data:\n${contextText}\n\n---\nIncoming message:\n${messageText || '(empty)'}\n\nOutput JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 600,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) return null;

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 3500)
      : null;
    if (!reply) return null;

    const result: InboundAiActionResult = { reply };

    if (parsed.send_whatsapp && typeof parsed.send_whatsapp === 'object') {
      const p = parsed.send_whatsapp.phone;
      const b = parsed.send_whatsapp.body;
      if (typeof p === 'string' && typeof b === 'string' && /^\+?[0-9]{10,15}$/.test(p.replace(/^whatsapp:/i, '').replace(/\s/g, ''))) {
        const phone = p.replace(/^whatsapp:/i, '').trim();
        result.sendWhatsAppTo = { phone: phone.startsWith('+') ? phone : `+${phone}`, body: String(b).slice(0, 3500) };
      }
    }
    if (typeof parsed.ask_for_number === 'string' && parsed.ask_for_number.trim()) {
      result.askForNumber = parsed.ask_for_number.trim();
    }
    if (parsed.create_task && typeof parsed.create_task === 'object' && typeof parsed.create_task.title === 'string' && parsed.create_task.title.trim()) {
      result.createTask = {
        title: parsed.create_task.title.trim().slice(0, 500),
        description: typeof parsed.create_task.description === 'string' ? parsed.create_task.description.trim().slice(0, 5000) : undefined,
      };
    }
    if (parsed.update_task && typeof parsed.update_task === 'object' && typeof parsed.update_task.task_ref === 'string') {
      result.updateTask = {
        taskRef: parsed.update_task.task_ref.trim(),
        status: typeof parsed.update_task.status === 'string' ? parsed.update_task.status : undefined,
        feedback: typeof parsed.update_task.feedback === 'string' ? parsed.update_task.feedback.trim() : undefined,
      };
    }

    return result;
  } catch (e) {
    console.error('generateAiReplyForInboundMessage:', e);
    return null;
  }
}

/** Execute inbound AI actions: send WhatsApp, create task, update task. */
export async function executeInboundAiActions(
  companyId: string,
  taskId: string,
  adminId: string,
  result: InboundAiActionResult
): Promise<void> {
  if (result.sendWhatsAppTo) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (accountSid && authToken && from) {
      try {
        const to = result.sendWhatsAppTo.phone.startsWith('+') ? `whatsapp:${result.sendWhatsAppTo.phone}` : `whatsapp:+${result.sendWhatsAppTo.phone}`;
        const taskRef = taskId.slice(-6).toUpperCase();
        const body = `[رد على المهمة #${taskRef}]\n${result.sendWhatsAppTo.body}`.slice(0, 4096);
        await twilio(accountSid, authToken).messages.create({
          from,
          to,
          body,
        });
        await prisma.coordinatorTask.update({
          where: { id: taskId },
          data: { awaitingFeedbackFrom: to },
        });
      } catch (e) {
        console.error('executeInboundAiActions sendWhatsApp:', e);
      }
    }
  }

  if (result.createTask && result.createTask.title) {
    await prisma.coordinatorTask.create({
      data: {
        title: result.createTask.title,
        description: result.createTask.description ?? null,
        status: CoordinatorTaskStatus.PENDING,
        companyId,
        createdById: adminId,
        source: 'whatsapp',
      },
    });
  }

  if (result.updateTask && result.updateTask.taskRef) {
    const tasks = await prisma.coordinatorTask.findMany({ where: { companyId }, select: { id: true } });
    const match = tasks.find(
      (t) => t.id === result.updateTask!.taskRef || t.id.endsWith(result.updateTask!.taskRef) || t.id.slice(-6).toUpperCase() === result.updateTask!.taskRef.toUpperCase()
    );
    if (match) {
      const data: { status?: CoordinatorTaskStatus; completedAt?: Date; coordinatorFeedback?: string } = {};
      if (result.updateTask.status && VALID_STATUSES.includes(result.updateTask.status as CoordinatorTaskStatus)) {
        data.status = result.updateTask.status as CoordinatorTaskStatus;
        if (data.status === CoordinatorTaskStatus.COMPLETED) data.completedAt = new Date();
      }
      if (result.updateTask.feedback) data.coordinatorFeedback = result.updateTask.feedback;
      if (Object.keys(data).length > 0) {
        await prisma.coordinatorTask.update({ where: { id: match.id }, data });
      }
    }
  }
}
