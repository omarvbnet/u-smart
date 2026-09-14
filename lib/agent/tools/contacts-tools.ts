import { z } from 'zod';
import { prisma as _prisma } from '@/lib/prisma';
import { phoneLookupVariants, phonesMatch } from '@/lib/phone-match';
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

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function matchQuery(q: string | undefined, name: string, phone: string): boolean {
  if (!q || !q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return name.toLowerCase().includes(needle) || phone.includes(needle) || normalizePhone(phone).includes(normalizePhone(needle));
}

export function registerContactsTools(): void {
  registerTool({
    id: 'list_contacts',
    name: 'List contacts',
    description:
      'List people the user can message/call on WhatsApp or Telegram. Workspace users: company directory. Personal/individual users: device phone contacts shared from the app (plus self). Prefer before whatsapp_* / telegram_* tools.',
    category: 'contacts',
    riskLevel: 'READ',
    requiresApproval: false,
    executeImmediately: true,
    requiredPermissions: ['agent.read_contacts'],
    enabled: true,
    version: '2',
    timeoutMs: 12000,
    inputSchema: listContactsInput,
    jsonSchema: zodToJsonSchemaRough(listContactsInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = listContactsInput.parse(input);
      const limit = parsed.limit ?? 40;
      const q = parsed.query?.trim();
      const roleFilter = parsed.role?.trim().toUpperCase();
      const roleUpper = String(ctx.role || '').toUpperCase();
      const isPersonal =
        !ctx.privateCompanyId ||
        roleUpper === 'PERSONAL' ||
        roleUpper === 'INDIVIDUAL' ||
        roleUpper === 'USER';

      if (isPersonal && !ctx.privateCompanyId) {
        const device = (ctx.deviceContacts || [])
          .filter((c) => c.phone && normalizePhone(c.phone).length >= 8)
          .filter((c) => matchQuery(q, c.name || '', c.phone))
          .slice(0, limit)
          .map((c, i) => ({
            id: `device-${i}-${normalizePhone(c.phone).slice(-8)}`,
            username: null as string | null,
            name: c.name || c.phone,
            phone: c.phone,
            role: 'DEVICE_CONTACT',
            province: null as string | null,
            email: null as string | null,
            isOwner: false,
            channels: { whatsapp: true, telegram: false },
            source: 'device',
          }));

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

        const contacts = [
          ...(self
            ? [
                {
                  ...self,
                  isOwner: false,
                  channels: { whatsapp: !!self.phone, telegram: false },
                  source: 'self',
                },
              ]
            : []),
          ...device,
        ];

        return {
          ok: true,
          message: device.length
            ? `Found ${device.length} phone contact(s) from the user’s device (plus self). Use phone with WhatsApp tools.`
            : 'No saved phone contacts yet. Ask the user for a name/phone number, or to add one in U Agent WhatsApp settings.',
          data: {
            contacts,
            count: contacts.length,
            deviceContactCount: device.length,
            personal: true,
          },
        };
      }

      if (!ctx.privateCompanyId) {
        return {
          ok: true,
          message: 'No workspace and no device contacts available.',
          data: { contacts: [], count: 0 },
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
        const variants = phoneLookupVariants(q);
        where.OR = [
          { username: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          ...variants.map((v) => ({ phone: { contains: v } })),
          ...variants
            .map((v) => v.replace(/\D/g, ''))
            .filter((d) => d.length >= 8)
            .map((d) => ({ phone: { contains: d.slice(-9) } })),
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
        take: Math.min(120, limit * 3),
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

      const filtered = q
        ? rows.filter(
            (r) =>
              matchQuery(q, r.name || r.username || '', r.phone || '') ||
              phonesMatch(r.phone || '', q)
          )
        : rows;

      const contacts = filtered.slice(0, limit).map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        phone: r.phone,
        role: r.role,
        province: r.province,
        email: r.email,
        isOwner: ownerId === r.id,
        channels: {
          whatsapp: !!r.phone && normalizePhone(r.phone).length >= 8,
          telegram: true,
        },
        source: 'workspace',
      }));

      return {
        ok: true,
        message: contacts.length
          ? `Found ${contacts.length} contact(s). Use phone with WhatsApp tools — a raw number is enough even if not saved.`
          : 'No contacts matched. If the user gave a phone number, use it directly with WhatsApp tools.',
        data: { contacts, count: contacts.length, workspaceId: ctx.privateCompanyId },
      };
    },
  });
}
