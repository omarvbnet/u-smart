import { z } from 'zod';
import { prisma as _prisma } from '@/lib/prisma';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const listContactsInput = z.object({
  query: z.string().max(80).optional(),
  role: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(80).optional(),
});

export function registerContactsTools(): void {
  registerTool({
    id: 'list_contacts',
    name: 'List workspace contacts',
    description:
      'List people in the user’s Proviser workspace (name, phone, role, username) so U Agent can message or call them on WhatsApp or Telegram. Prefer this before whatsapp_* / telegram_* tools.',
    category: 'contacts',
    riskLevel: 'READ',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.read_contacts'],
    enabled: true,
    version: '1',
    timeoutMs: 12000,
    inputSchema: listContactsInput,
    jsonSchema: zodToJsonSchemaRough(listContactsInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = listContactsInput.parse(input);
      const limit = parsed.limit ?? 40;
      const q = parsed.query?.trim();
      const roleFilter = parsed.role?.trim().toUpperCase();

      if (!ctx.privateCompanyId) {
        const self = await prisma.ticketRequester.findUnique({
          where: { id: ctx.userId },
          select: {
            id: true,
            username: true,
            name: true,
            phone: true,
            role: true,
            province: true,
            email: true,
          },
        });
        return {
          ok: true,
          message: 'Personal account — only your own contact is available.',
          data: {
            contacts: self
              ? [
                  {
                    ...self,
                    isOwner: false,
                    channels: { whatsapp: !!self.phone, telegram: false },
                  },
                ]
              : [],
            count: self ? 1 : 0,
          },
        };
      }

      const company = await prisma.privateCompany.findUnique({
        where: { id: ctx.privateCompanyId },
        select: { ownerRequesterId: true },
      });
      const ownerId = company?.ownerRequesterId as string | undefined;

      const where: Record<string, unknown> = {
        privateCompanyId: ctx.privateCompanyId,
        status: { not: 'BLOCKED' },
      };
      if (roleFilter) where.role = roleFilter;
      if (q && q.length >= 1) {
        where.OR = [
          { username: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }

      const rows: Array<{
        id: string;
        username: string;
        name: string | null;
        phone: string;
        role: string | null;
        province: string | null;
        email: string | null;
      }> = await prisma.ticketRequester.findMany({
        where,
        take: limit,
        orderBy: [{ name: 'asc' }, { username: 'asc' }],
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          role: true,
          province: true,
          email: true,
        },
      });

      const contacts = rows.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        phone: r.phone,
        role: r.role,
        province: r.province,
        email: r.email,
        isOwner: ownerId === r.id,
        channels: {
          whatsapp: !!r.phone && r.phone.replace(/\D/g, '').length >= 8,
          telegram: true,
        },
      }));

      return {
        ok: true,
        message: contacts.length
          ? `Found ${contacts.length} contact(s). Use phone with WhatsApp tools, or telegramUsername/chatId with Telegram.`
          : 'No contacts matched. Try a different query.',
        data: { contacts, count: contacts.length, workspaceId: ctx.privateCompanyId },
      };
    },
  });
}
