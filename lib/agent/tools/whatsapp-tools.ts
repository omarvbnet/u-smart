import { z } from 'zod';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { getWhatsAppConsent } from '@/lib/agent/whatsapp/consent';
import {
  prepareWhatsAppCall,
  sendWhatsAppMedia,
  sendWhatsAppText,
  toWhatsAppDigits,
} from '@/lib/whatsapp-cloud-messaging';

const sendMessageInput = z.object({
  toPhone: z.string().min(8).max(32),
  body: z.string().min(1).max(4000),
});

const sendFileInput = z.object({
  toPhone: z.string().min(8).max(32),
  mediaUrl: z.string().url(),
  kind: z.enum(['image', 'document', 'audio', 'video']).default('document'),
  filename: z.string().max(160).optional(),
  caption: z.string().max(1000).optional(),
});

const startCallInput = z.object({
  toPhone: z.string().min(8).max(32),
  note: z.string().max(500).optional(),
});

export async function executeApprovedWhatsAppSendMessage(
  payload: Record<string, unknown>
): Promise<ToolResult> {
  const toPhone = String(payload.toPhone || '');
  const body = String(payload.body || '');
  const userId = String(payload.requestedById || payload.userId || '');
  if (userId) {
    const consent = await getWhatsAppConsent(userId);
    if (!consent.granted || !consent.canSendMessages) {
      return { ok: false, message: 'User WhatsApp message permission revoked or missing.' };
    }
  }
  const result = await sendWhatsAppText({ to: toPhone, body });
  return {
    ok: result.ok,
    message: result.message,
    data: {
      messageId: result.messageId,
      deepLink: result.deepLink,
      to: toWhatsAppDigits(toPhone),
      kind: 'whatsapp_message',
    },
  };
}

export async function executeApprovedWhatsAppSendFile(
  payload: Record<string, unknown>
): Promise<ToolResult> {
  const userId = String(payload.requestedById || payload.userId || '');
  if (userId) {
    const consent = await getWhatsAppConsent(userId);
    if (!consent.granted || !consent.canSendFiles) {
      return { ok: false, message: 'User WhatsApp file permission revoked or missing.' };
    }
  }
  const result = await sendWhatsAppMedia({
    to: String(payload.toPhone || ''),
    mediaUrl: String(payload.mediaUrl || ''),
    kind: (payload.kind as 'image' | 'document' | 'audio' | 'video') || 'document',
    filename: typeof payload.filename === 'string' ? payload.filename : undefined,
    caption: typeof payload.caption === 'string' ? payload.caption : undefined,
  });
  return {
    ok: result.ok,
    message: result.message,
    data: {
      messageId: result.messageId,
      deepLink: result.deepLink,
      kind: 'whatsapp_file',
    },
  };
}

export async function executeApprovedWhatsAppStartCall(
  payload: Record<string, unknown>
): Promise<ToolResult> {
  const userId = String(payload.requestedById || payload.userId || '');
  if (userId) {
    const consent = await getWhatsAppConsent(userId);
    if (!consent.granted || !consent.canStartCalls) {
      return { ok: false, message: 'User WhatsApp call permission revoked or missing.' };
    }
  }
  const result = prepareWhatsAppCall({
    to: String(payload.toPhone || ''),
    note: typeof payload.note === 'string' ? payload.note : undefined,
  });
  return {
    ok: result.ok,
    message: result.message,
    data: {
      deepLink: result.deepLink,
      callLink: result.callLink,
      kind: 'whatsapp_call',
    },
  };
}

export function registerWhatsAppTools(): void {
  registerTool({
    id: 'whatsapp_send_message',
    name: 'Send WhatsApp message',
    description:
      'Send a WhatsApp text message to a phone number immediately after the user granted WhatsApp messaging permission in the app. Use list_contacts to find numbers. No workspace admin approval.',
    category: 'whatsapp',
    riskLevel: 'EXTERNAL',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.whatsapp'],
    enabled: true,
    version: '2',
    timeoutMs: 25000,
    inputSchema: sendMessageInput,
    jsonSchema: zodToJsonSchemaRough(sendMessageInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = sendMessageInput.parse(input);
      const consent = await getWhatsAppConsent(ctx.userId);
      if (!consent.granted || !consent.canSendMessages) {
        return {
          ok: false,
          message:
            'User has not granted WhatsApp messaging permission. Ask them to enable it in U Agent → WhatsApp permissions.',
        };
      }
      return executeApprovedWhatsAppSendMessage({
        ...parsed,
        userId: ctx.userId,
        requestedById: ctx.userId,
      });
    },
  });

  registerTool({
    id: 'whatsapp_send_file',
    name: 'Send WhatsApp file',
    description:
      'Send an image/document/audio/video via WhatsApp using a public Proviser URL. Requires user WhatsApp file permission. No admin approval.',
    category: 'whatsapp',
    riskLevel: 'EXTERNAL',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.whatsapp'],
    enabled: true,
    version: '2',
    timeoutMs: 30000,
    inputSchema: sendFileInput,
    jsonSchema: zodToJsonSchemaRough(sendFileInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = sendFileInput.parse(input);
      const consent = await getWhatsAppConsent(ctx.userId);
      if (!consent.granted || !consent.canSendFiles) {
        return {
          ok: false,
          message:
            'User has not granted WhatsApp file permission. Ask them to enable it in U Agent → WhatsApp permissions.',
        };
      }
      return executeApprovedWhatsAppSendFile({
        ...parsed,
        userId: ctx.userId,
        requestedById: ctx.userId,
      });
    },
  });

  registerTool({
    id: 'whatsapp_start_call',
    name: 'Start WhatsApp call',
    description:
      'Prepare a WhatsApp voice/video call deep link for a contact phone. Requires user call permission. Executes immediately (opens on the user’s device).',
    category: 'whatsapp',
    riskLevel: 'EXTERNAL',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.whatsapp'],
    enabled: true,
    version: '2',
    timeoutMs: 15000,
    inputSchema: startCallInput,
    jsonSchema: zodToJsonSchemaRough(startCallInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = startCallInput.parse(input);
      const consent = await getWhatsAppConsent(ctx.userId);
      if (!consent.granted || !consent.canStartCalls) {
        return {
          ok: false,
          message:
            'User has not granted WhatsApp call permission. Ask them to enable it in U Agent → WhatsApp permissions.',
        };
      }
      return executeApprovedWhatsAppStartCall({
        ...parsed,
        userId: ctx.userId,
        requestedById: ctx.userId,
      });
    },
  });
}
