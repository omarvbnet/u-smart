import type { AgentCapability, AgentContext, AgentPolicySnapshot, AgentTimelineStep } from '@/lib/agent/types';
import { hasAgentCapability } from '@/lib/agent/permissions/capabilities';
import { autonomyAllowsRisk } from '@/lib/agent/policies/policy';
import { modelRouter } from '@/lib/agent/models/router';
import { U_AGENT_SYSTEM_POLICY, wrapUntrustedUserContent } from '@/lib/agent/prompts/system';
import {
  getTool,
  listTools,
  toolsAsOpenAiFunctions,
} from '@/lib/agent/tools/registry';
import { registerProviserTools } from '@/lib/agent/tools/proviser-tools';
import { registerPhase1Tools } from '@/lib/agent/tools/phase1-tools';
import { registerDocumentTools } from '@/lib/agent/tools/document-tools';
import { registerWhatsAppTools } from '@/lib/agent/tools/whatsapp-tools';
import { registerContactsTools } from '@/lib/agent/tools/contacts-tools';
import { registerTelegramTools } from '@/lib/agent/tools/telegram-tools';
import { createApprovalRequest } from '@/lib/agent/approvals/approvals';
import {
  appendMessage,
  getOrCreateConversation,
  loadRecentMessages,
} from '@/lib/agent/memory/conversations';
import { countTodayAiRequests, recordAgentUsage, writeAgentAudit } from '@/lib/agent/usage';
import { prisma as _prisma } from '@/lib/prisma';
import type { ChatMessage } from '@/lib/agent/providers/types';
import {
  attachmentsToPromptBlock,
  processAgentAttachments,
  type ProcessedAttachment,
} from '@/lib/agent/multimodal/process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type AgentArtifact = {
  url: string;
  name: string;
  title?: string;
  contentType?: string;
  format?: string;
  kind?: string;
  size?: number;
};

let toolsRegistered = false;
function ensureTools(): void {
  if (!toolsRegistered) {
    registerProviserTools();
    registerPhase1Tools();
    registerDocumentTools();
    registerWhatsAppTools();
    registerContactsTools();
    registerTelegramTools();
    toolsRegistered = true;
  }
}

function pushArtifact(artifacts: AgentArtifact[], result: { data?: unknown }) {
  const data = result.data;
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  const link =
    (typeof d.url === 'string' && d.url) ||
    (typeof d.deepLink === 'string' && d.deepLink) ||
    (typeof d.callLink === 'string' && d.callLink) ||
    '';
  if (!link) return;
  const kind = typeof d.kind === 'string' ? d.kind : 'document';
  const isWhatsApp = kind.startsWith('whatsapp_') || kind.startsWith('telegram_');
  const isDoc =
    kind === 'document' ||
    String(d.name || '').match(/\.(md|csv|txt|json|pdf)$/i);
  if (!isWhatsApp && !isDoc) return;
  artifacts.push({
    url: link,
    name: String(d.name || (isWhatsApp ? 'Open WhatsApp' : 'document')),
    title:
      typeof d.title === 'string'
        ? d.title
        : isWhatsApp
          ? kind === 'whatsapp_call'
            ? 'Open WhatsApp call'
            : 'Open WhatsApp'
          : undefined,
    contentType: typeof d.contentType === 'string' ? d.contentType : undefined,
    format: typeof d.format === 'string' ? d.format : undefined,
    kind,
    size: typeof d.size === 'number' ? d.size : undefined,
  });
}

function pushTimeline(steps: AgentTimelineStep[], label: string, status: AgentTimelineStep['status'], tool?: string, detail?: string) {
  steps.push({
    at: new Date().toISOString(),
    label,
    status,
    tool,
    detail,
  });
}

export type RunAgentMessageResult = {
  success: boolean;
  message: string;
  conversationId?: string;
  executionId?: string;
  reply?: string;
  status?: string;
  timeline?: AgentTimelineStep[];
  approvalIds?: string[];
  artifacts?: AgentArtifact[];
};

/**
 * OBSERVE → UNDERSTAND → RETRIEVE → PLAN → RISK → PERMISSION → APPROVAL → EXECUTE → VERIFY → UPDATE → REPORT
 */
export async function runAgentMessage(args: {
  ctx: AgentContext;
  capabilities: Set<AgentCapability>;
  policy: AgentPolicySnapshot;
  text: string;
  conversationId?: string | null;
  attachmentUrls?: string[];
  attachments?: Array<{
    url: string;
    name?: string | null;
    contentType?: string | null;
    size?: number | null;
  }>;
  idempotencyKey?: string;
  deviceContacts?: Array<{ name: string; phone: string }>;
}): Promise<RunAgentMessageResult> {
  ensureTools();
  const timeline: AgentTimelineStep[] = [];
  const approvalIds: string[] = [];
  const artifacts: AgentArtifact[] = [];

  const ctx = {
    ...args.ctx,
    deviceContacts: args.deviceContacts?.length ? args.deviceContacts : args.ctx.deviceContacts,
  };

  pushTimeline(timeline, 'Received user message', 'THINKING');

  if (args.policy.dailyAiRequestLimit > 0 && ctx.privateCompanyId) {
    const used = await countTodayAiRequests(ctx.privateCompanyId);
    if (used >= args.policy.dailyAiRequestLimit) {
      return {
        success: false,
        message: `Daily AI request limit reached (${args.policy.dailyAiRequestLimit}).`,
      };
    }
  }

  const conversation = await getOrCreateConversation({
    userId: ctx.userId,
    privateCompanyId: ctx.privateCompanyId,
    conversationId: args.conversationId,
  });

  const rawAttachments =
    args.attachments?.length
      ? args.attachments
      : (args.attachmentUrls || []).map((url) => ({ url }));

  let processed: ProcessedAttachment[] = [];
  if (rawAttachments.length) {
    pushTimeline(timeline, 'Processing attachments', 'PLANNING');
    processed = await processAgentAttachments(rawAttachments, {
      privateCompanyId: ctx.privateCompanyId,
      userId: ctx.userId,
    });
  }

  await appendMessage({
    conversationId: conversation.id,
    userId: ctx.userId,
    role: 'USER',
    content: args.text,
    attachments: processed.length ? processed : args.attachmentUrls?.length ? args.attachmentUrls : undefined,
  });

  let executionId: string | undefined;
  if (prisma.uAgentExecution?.create) {
    const exec = await prisma.uAgentExecution.create({
      data: {
        conversationId: conversation.id,
        privateCompanyId: ctx.privateCompanyId,
        userId: ctx.userId,
        status: 'THINKING',
        timeline,
      },
      select: { id: true },
    });
    executionId = exec.id;
  }

  pushTimeline(timeline, 'Retrieved conversation context', 'PLANNING');
  const history = await loadRecentMessages(conversation.id, 16);

  const allowedToolIds =
    args.policy.allowedTools && args.policy.allowedTools.length
      ? args.policy.allowedTools
      : listTools()
          .filter((t) => hasAgentCapability(args.capabilities, t.requiredPermissions))
          .map((t) => t.id);

  const openAiTools = toolsAsOpenAiFunctions(allowedToolIds);

  const attachmentBlock = attachmentsToPromptBlock(processed);
  const userPayload = attachmentBlock
    ? `${args.text}\n\n<<<UNTRUSTED_ATTACHMENTS>>>\n${attachmentBlock}\n<<<END_UNTRUSTED_ATTACHMENTS>>>`
    : args.text;

  const messages: ChatMessage[] = [
    { role: 'system', content: U_AGENT_SYSTEM_POLICY },
    {
      role: 'system',
      content: `User context: role=${ctx.role}; workspace=${ctx.privateCompanyId ?? 'none'}; autonomy=${args.policy.autonomyLevel}; name=${ctx.name ?? ctx.username}. Timezone=Asia/Baghdad.`,
    },
    ...history.slice(0, -1).map((m) => ({
      role: (m.role === 'USER' ? 'user' : m.role === 'ASSISTANT' ? 'assistant' : 'system') as ChatMessage['role'],
      content: m.role === 'USER' ? wrapUntrustedUserContent(m.content) : m.content,
    })),
    { role: 'user', content: wrapUntrustedUserContent(userPayload) },
  ];

  pushTimeline(timeline, 'Planning with model', 'PLANNING');
  const aiReady = await modelRouter.hasProvider();
  const modelId = await modelRouter.resolveModel('fast');
  await recordAgentUsage({
    privateCompanyId: ctx.privateCompanyId,
    userId: ctx.userId,
    resourceType: 'ai_request',
    quantity: 1,
    provider: aiReady ? 'router' : 'none',
    model: modelId,
  });

  // Offline / no-key fallback: keyword-driven read tools so Phase 0 works without OpenAI.
  if (!aiReady) {
    const lower = args.text.toLowerCase();
    const wantsKpi =
      /kpi|تقرير|مبيعات|analytics|شوفلي|اليوم|اليومه|شنو صار/.test(lower) ||
      /report|summary|اليوم/.test(args.text);
    const wantsTickets = /ticket|تذكر|تذاكر|طلب|مهمة|task/.test(lower) || wantsKpi;
    const wantsSites = /site|موقع|مواقع|location|فرع/.test(lower);
    const wantsWarehouse = /warehouse|مخزن|مواد|material/.test(lower);
    const toolIds: string[] = [];
    if (wantsKpi && allowedToolIds.includes('get_workspace_kpis')) toolIds.push('get_workspace_kpis');
    if (wantsTickets && allowedToolIds.includes('search_tickets')) toolIds.push('search_tickets');
    if (wantsSites && allowedToolIds.includes('list_sites')) toolIds.push('list_sites');
    if (wantsWarehouse && allowedToolIds.includes('warehouse_read')) toolIds.push('warehouse_read');
    if (!toolIds.length && allowedToolIds.includes('search_tickets')) toolIds.push('search_tickets');

    const summaries: string[] = [];
    for (const id of toolIds) {
      const tool = getTool(id);
      if (!tool) continue;
      pushTimeline(timeline, `Executing ${id}`, 'EXECUTING', id);
      try {
        const result = await tool.execute({
          input: id === 'get_workspace_kpis' ? { days: 1 } : { limit: 15 },
          ctx: ctx,
        });
        summaries.push(`${tool.name}: ${result.message} ${JSON.stringify(result.data ?? {}).slice(0, 800)}`);
        await writeAgentAudit({
          privateCompanyId: ctx.privateCompanyId,
          actorUserId: ctx.userId,
          action: result.ok ? 'TOOL_EXECUTED' : 'TOOL_FAILED',
          toolId: id,
          result,
        });
      } catch (e) {
        summaries.push(`${id} failed: ${e instanceof Error ? e.message : 'error'}`);
      }
    }

    const reply = [
      'U Agent (وضع بدون مفتاح AI): نفذت أدوات القراءة المتاحة.',
      ...summaries,
      'فعّل OPENAI_API_KEY لردود ذكية باللهجة العراقية وتخطيط أعمق.',
    ].join('\n');

    await appendMessage({ conversationId: conversation.id, role: 'ASSISTANT', content: reply });
    pushTimeline(timeline, 'Reported result', 'COMPLETED');
    if (executionId && prisma.uAgentExecution?.update) {
      await prisma.uAgentExecution.update({
        where: { id: executionId },
        data: { status: 'COMPLETED', timeline, resultSummary: reply.slice(0, 2000), completedAt: new Date() },
      });
    }
    return {
      success: true,
      message: 'ok',
      conversationId: conversation.id,
      executionId,
      reply,
      status: 'COMPLETED',
      timeline,
      approvalIds: [],
    };
  }

  let completion = await modelRouter.chat({
    kind: 'fast',
    messages,
    tools: openAiTools.length ? openAiTools : undefined,
  });

  // Tool loop (max 4 rounds)
  for (let round = 0; round < 4 && completion.toolCalls.length > 0; round++) {
    pushTimeline(timeline, 'Executing tools', 'EXECUTING', completion.toolCalls.map((t) => t.name).join(','));

    messages.push({
      role: 'assistant',
      content: completion.content || '',
      tool_calls: completion.toolCalls,
    });

    for (const call of completion.toolCalls) {
      const tool = getTool(call.name);
      let toolPayload: unknown = {};
      try {
        toolPayload = JSON.parse(call.arguments || '{}');
      } catch {
        toolPayload = {};
      }

      if (!tool || !tool.enabled) {
        const msg = `Tool ${call.name} is not available.`;
        messages.push({ role: 'tool', content: JSON.stringify({ ok: false, message: msg }), tool_call_id: call.id, name: call.name });
        await appendMessage({ conversationId: conversation.id, role: 'TOOL', content: msg, toolName: call.name, toolCallId: call.id });
        continue;
      }

      if (!hasAgentCapability(args.capabilities, tool.requiredPermissions)) {
        const msg = `Permission denied for tool ${tool.id}.`;
        await writeAgentAudit({
          privateCompanyId: ctx.privateCompanyId,
          actorUserId: ctx.userId,
          action: 'TOOL_DENIED',
          toolId: tool.id,
          error: msg,
        });
        messages.push({ role: 'tool', content: JSON.stringify({ ok: false, message: msg }), tool_call_id: call.id, name: call.name });
        continue;
      }

      if (args.policy.allowedTools && !args.policy.allowedTools.includes(tool.id)) {
        const msg = `Tool ${tool.id} disabled by owner policy.`;
        messages.push({ role: 'tool', content: JSON.stringify({ ok: false, message: msg }), tool_call_id: call.id, name: call.name });
        continue;
      }

      const gate = tool.executeImmediately
        ? { ok: true, needsApproval: false }
        : autonomyAllowsRisk(
            args.policy.autonomyLevel,
            tool.riskLevel,
            tool.requiresApproval
          );

      if (gate.needsApproval) {
        pushTimeline(timeline, `Approval required: ${tool.id}`, 'WAITING_APPROVAL', tool.id);
        const enrichedPayload: Record<string, unknown> = {
          ...toolPayload,
          requesterId: ctx.userId,
          userId: ctx.userId,
          requestedById: ctx.userId,
          privateCompanyId: ctx.privateCompanyId,
          companyId: ctx.privateCompanyId,
        };
        const approval = await createApprovalRequest({
          privateCompanyId: ctx.privateCompanyId,
          conversationId: conversation.id,
          executionId: executionId ?? null,
          requestedById: ctx.userId,
          toolId: tool.id,
          action: `Execute ${tool.id}`,
          reason: `User asked: ${args.text.slice(0, 200)}`,
          riskLevel: tool.riskLevel,
          payload: enrichedPayload,
        });
        approvalIds.push(approval.id);
        const msg = `Waiting for approval (${approval.id}) before running ${tool.id}. Tell the user clearly this is PENDING.`;
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            ok: true,
            needsApproval: true,
            approvalId: approval.id,
            message: msg,
            status: 'PENDING_APPROVAL',
          }),
          tool_call_id: call.id,
          name: call.name,
        });
        await appendMessage({
          conversationId: conversation.id,
          role: 'TOOL',
          content: msg,
          toolName: tool.id,
          toolCallId: call.id,
        });
        continue;
      }

      let result;
      try {
        const validated = tool.inputSchema.safeParse(toolPayload);
        if (!validated.success) {
          result = { ok: false, message: `Invalid input: ${validated.error.message}` };
        } else {
          result = await tool.execute({
            input: validated.data,
            ctx: ctx,
            idempotencyKey: args.idempotencyKey,
          });
        }
      } catch (e) {
        result = {
          ok: false,
          message: e instanceof Error ? e.message : 'Tool execution failed',
        };
      }

      if (result.needsApproval && result.approvalId) {
        approvalIds.push(result.approvalId);
        pushTimeline(timeline, `Approval required: ${tool.id}`, 'WAITING_APPROVAL', tool.id);
      }

      await writeAgentAudit({
        privateCompanyId: ctx.privateCompanyId,
        actorUserId: ctx.userId,
        action: result.ok ? 'TOOL_EXECUTED' : 'TOOL_FAILED',
        toolId: tool.id,
        input: toolPayload,
        result,
        error: result.ok ? null : result.message,
        approvalId: result.approvalId ?? null,
      });

      if (result.ok || (result.data && typeof result.data === 'object' && ('deepLink' in (result.data as object) || 'callLink' in (result.data as object) || 'url' in (result.data as object)))) {
        pushArtifact(artifacts, result);
      }

      await recordAgentUsage({
        privateCompanyId: ctx.privateCompanyId,
        userId: ctx.userId,
        resourceType: 'tool_execution',
        quantity: 1,
        metadata: { toolId: tool.id, ok: result.ok },
      });

      const serialized = JSON.stringify(result).slice(0, 8000);
      messages.push({
        role: 'tool',
        content: serialized,
        tool_call_id: call.id,
        name: call.name,
      });
      await appendMessage({
        conversationId: conversation.id,
        role: 'TOOL',
        content: serialized,
        toolName: tool.id,
        toolCallId: call.id,
      });
      pushTimeline(
        timeline,
        result.ok ? `Tool ${tool.id} ok` : `Tool ${tool.id} failed`,
        result.ok ? 'DONE' : 'FAILED',
        tool.id,
        result.message
      );
    }

    completion = await modelRouter.chat({
      kind: 'fast',
      messages,
      tools: openAiTools.length ? openAiTools : undefined,
    });
  }

  const reply =
    (completion.content && completion.content.trim()) ||
    (approvalIds.length
      ? 'طلبت موافقة على إجراء حساس. راح أكمل بعد الموافقة من المالك.'
      : 'تم. ماكو تفاصيل إضافية.');

  await appendMessage({
    conversationId: conversation.id,
    role: 'ASSISTANT',
    content: reply,
  });

  const finalStatus = approvalIds.length ? 'WAITING_APPROVAL' : 'COMPLETED';
  pushTimeline(timeline, 'Reported result', finalStatus === 'COMPLETED' ? 'COMPLETED' : 'WAITING_APPROVAL');

  if (executionId && prisma.uAgentExecution?.update) {
    await prisma.uAgentExecution.update({
      where: { id: executionId },
      data: {
        status: finalStatus,
        timeline,
        resultSummary: reply.slice(0, 2000),
        completedAt: new Date(),
      },
    });
  }
  if (prisma.uAgentConversation?.update) {
    await prisma.uAgentConversation.update({
      where: { id: conversation.id },
      data: { status: finalStatus === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : 'ONLINE' },
    });
  }

  return {
    success: true,
    message: 'ok',
    conversationId: conversation.id,
    executionId,
    reply,
    status: finalStatus,
    timeline,
    approvalIds,
    artifacts: artifacts.length ? artifacts : undefined,
  };
}
