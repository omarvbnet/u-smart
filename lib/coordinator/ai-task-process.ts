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
