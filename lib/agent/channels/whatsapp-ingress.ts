import { prisma as _prisma } from '@/lib/prisma';
import { isUAgentGloballyEnabled } from '@/lib/agent/config';
import { getOrCreateAgentPolicy } from '@/lib/agent/policies/policy';
import { resolveAgentCapabilities } from '@/lib/agent/permissions/capabilities';
import { runAgentMessage } from '@/lib/agent/core/run';
import type { AgentContext } from '@/lib/agent/types';
import { writeAgentAudit } from '@/lib/agent/usage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type WaTextMessage = {
  from?: string;
  type?: string;
  text?: { body?: string };
  id?: string;
};

/**
 * Extract inbound WhatsApp text messages from Meta Cloud webhook payload.
 */
export function extractWhatsAppTextMessages(payload: unknown): WaTextMessage[] {
  const out: WaTextMessage[] = [];
  if (!payload || typeof payload !== 'object') return out;
  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) return out;
  for (const e of entry) {
    const changes = (e as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const value = (c as { value?: { messages?: WaTextMessage[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        if (m && (m.type === 'text' || m.text?.body)) out.push(m);
      }
    }
  }
  return out;
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Fire-and-forget: map WhatsApp sender phone → TicketRequester, run U Agent
 * when the member's workspace has whatsappIngressEnabled.
 */
export function handleWhatsAppIngress(payload: unknown): void {
  void (async () => {
    try {
      if (!isUAgentGloballyEnabled()) return;
      const messages = extractWhatsAppTextMessages(payload);
      if (!messages.length) return;

      for (const msg of messages) {
        const text = msg.text?.body?.trim();
        const from = msg.from?.trim();
        if (!text || !from) continue;

        const digits = normalizePhone(from);
        if (digits.length < 8) continue;

        const user = await prisma.ticketRequester.findFirst({
          where: {
            OR: [
              { phone: { contains: digits.slice(-10) } },
              { phone: { endsWith: digits.slice(-9) } },
            ],
            status: 'ACTIVE',
          },
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            privateCompanyId: true,
            privateCompanyDepartmentId: true,
            privateCompanyOwned: { select: { id: true, status: true } },
          },
        });
        if (!user) continue;

        const privateCompanyId =
          user.privateCompanyOwned?.status === 'APPROVED'
            ? user.privateCompanyOwned.id
            : user.privateCompanyId;
        if (!privateCompanyId) continue;

        const policy = await getOrCreateAgentPolicy(privateCompanyId);
        if (!policy.enabled || !policy.whatsappIngressEnabled) continue;

        const ctx: AgentContext = {
          userId: user.id,
          username: user.username,
          name: user.name,
          role: String(user.role || '').toUpperCase(),
          privateCompanyId,
          isWorkspaceOwner: user.privateCompanyOwned?.id === privateCompanyId,
          departmentId: user.privateCompanyDepartmentId,
        };
        const capabilities = resolveAgentCapabilities(ctx);

        await writeAgentAudit({
          privateCompanyId,
          actorUserId: user.id,
          action: 'WHATSAPP_INGRESS',
          input: { from, messageId: msg.id, textPreview: text.slice(0, 200) },
        });

        await runAgentMessage({
          ctx,
          capabilities,
          policy,
          text: `[WhatsApp] ${text}`,
          idempotencyKey: msg.id ? `wa-${msg.id}` : undefined,
        });
      }
    } catch (e) {
      console.error('handleWhatsAppIngress:', e);
    }
  })();
}
