import { z } from 'zod';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { sendTelegramText, telegramDeepLink } from '@/lib/telegram-messaging';

const sendMessageInput = z.object({
  /** Numeric Telegram chat id when known */
  chatId: z.string().min(1).max(64).optional(),
  /** @username without requiring @ */
  telegramUsername: z.string().min(2).max(64).optional(),
  body: z.string().min(1).max(4000),
  /** Optional phone for contact context / deep-link fallback */
  phone: z.string().max(32).optional(),
});

export function registerTelegramTools(): void {
  registerTool({
    id: 'telegram_send_message',
    name: 'Send Telegram message',
    description:
      'Send a Telegram message to a workspace contact. Prefer chatId when known; otherwise telegramUsername. Executes immediately (no admin approval). If the bot is not configured, returns a t.me deep link for the user to open.',
    category: 'telegram',
    riskLevel: 'EXTERNAL',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.telegram'],
    enabled: true,
    version: '1',
    timeoutMs: 25000,
    inputSchema: sendMessageInput,
    jsonSchema: zodToJsonSchemaRough(sendMessageInput),
    async execute({ input }): Promise<ToolResult> {
      const parsed = sendMessageInput.parse(input);
      if (!parsed.chatId && !parsed.telegramUsername) {
        return {
          ok: false,
          message:
            'Provide chatId or telegramUsername. Use list_contacts first; ask the user for their Telegram @username if missing.',
        };
      }

      if (parsed.chatId) {
        const result = await sendTelegramText({ chatId: parsed.chatId, body: parsed.body });
        return {
          ok: result.ok,
          message: result.message,
          data: {
            messageId: result.messageId,
            deepLink: result.deepLink,
            kind: 'telegram_message',
            chatId: parsed.chatId,
          },
        };
      }

      const deepLink = telegramDeepLink({
        username: parsed.telegramUsername,
        phone: parsed.phone,
        text: parsed.body,
      });
      return {
        ok: true,
        message: `Open Telegram to message @${parsed.telegramUsername?.replace(/^@/, '')}: ${deepLink}`,
        data: {
          deepLink,
          kind: 'telegram_message',
          telegramUsername: parsed.telegramUsername,
        },
      };
    },
  });
}
