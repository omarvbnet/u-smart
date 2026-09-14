import { z } from 'zod';
import { prisma as _prisma } from '@/lib/prisma';
import {
  workspaceTicketQuotaReached,
  type WorkspaceBillingInput,
} from '@/lib/private-company-billing';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { createApprovalRequest } from '@/lib/agent/approvals/approvals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const createTicketInput = z.object({
  technique: z.string().min(1),
  siteName: z.string().optional(),
  province: z.string().optional(),
  notes: z.string().optional(),
  category: z.string().optional(),
});

const listTicketTypesInput = z.object({
  query: z.string().optional(),
  category: z.enum(['INSPECTION_QC', 'MAINTENANCE']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const createTicketTypeInput = z.object({
  category: z.enum(['INSPECTION_QC', 'MAINTENANCE']),
  labelAr: z.string().min(1).max(120),
  labelEn: z.string().max(120).optional(),
  slug: z.string().max(80).optional(),
});

const assignTicketInput = z.object({
  ticketId: z.string().min(1),
  assigneeRequesterId: z.string().optional(),
});

const conflictInput = z.object({
  ticketId: z.string().min(1),
  result: z.enum(['not_accepted', 'ncr', 'accepted_with_comments', 'maintenance']),
  comment: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

const warehouseInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

function slugifyTechnique(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/\\]+/g, '_')
    .replace(/[^a-z0-9_\u0600-\u06ff-]+/gi, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return s || `type_${Date.now().toString(36)}`;
}

async function findTechniqueMatch(args: {
  privateCompanyId: string | null;
  technique: string;
}): Promise<{ known: boolean; slug: string; label?: string; source?: string }> {
  const raw = args.technique.trim();
  const slug = slugifyTechnique(raw);
  if (args.privateCompanyId && prisma.privateCompanyTechnique?.findFirst) {
    const row = await prisma.privateCompanyTechnique.findFirst({
      where: {
        companyId: args.privateCompanyId,
        active: true,
        OR: [
          { slug: { equals: slug, mode: 'insensitive' } },
          { slug: { equals: raw, mode: 'insensitive' } },
          { labelEn: { equals: raw, mode: 'insensitive' } },
          { labelAr: { contains: raw } },
        ],
      },
      select: { slug: true, labelAr: true, labelEn: true },
    });
    if (row) {
      return {
        known: true,
        slug: row.slug,
        label: row.labelEn || row.labelAr,
        source: 'workspace',
      };
    }
  }
  if (prisma.provisorTechnique?.findFirst) {
    const row = await prisma.provisorTechnique.findFirst({
      where: {
        active: true,
        OR: [
          { slug: { equals: slug, mode: 'insensitive' } },
          { slug: { equals: raw, mode: 'insensitive' } },
          { labelEn: { equals: raw, mode: 'insensitive' } },
          { labelAr: { contains: raw } },
        ],
      },
      select: { slug: true, labelAr: true, labelEn: true },
    });
    if (row) {
      return {
        known: true,
        slug: row.slug,
        label: row.labelEn || row.labelAr,
        source: 'platform',
      };
    }
  }
  return { known: false, slug };
}

export function registerPhase1Tools(): void {
  registerTool({
    id: 'list_ticket_types',
    name: 'List ticket types',
    description:
      'List available ticket/service types (techniques) for this workspace and platform catalog. Use before create_ticket.',
    category: 'tickets',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_tickets'],
    enabled: true,
    version: '1',
    timeoutMs: 12000,
    inputSchema: listTicketTypesInput,
    jsonSchema: zodToJsonSchemaRough(listTicketTypesInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = listTicketTypesInput.parse(input);
      const limit = parsed.limit ?? 40;
      const q = parsed.query?.trim();
      const types: Array<Record<string, unknown>> = [];

      if (ctx.privateCompanyId && prisma.privateCompanyTechnique?.findMany) {
        const rows = await prisma.privateCompanyTechnique.findMany({
          where: {
            companyId: ctx.privateCompanyId,
            active: true,
            ...(parsed.category ? { category: parsed.category } : {}),
            ...(q
              ? {
                  OR: [
                    { slug: { contains: q, mode: 'insensitive' } },
                    { labelAr: { contains: q } },
                    { labelEn: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          take: limit,
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
          select: { slug: true, category: true, labelAr: true, labelEn: true },
        });
        for (const r of rows) types.push({ ...r, source: 'workspace' });
      }

      if (types.length < limit && prisma.provisorTechnique?.findMany) {
        const rows = await prisma.provisorTechnique.findMany({
          where: {
            active: true,
            ...(parsed.category ? { category: parsed.category } : {}),
            ...(q
              ? {
                  OR: [
                    { slug: { contains: q, mode: 'insensitive' } },
                    { labelAr: { contains: q } },
                    { labelEn: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          take: limit - types.length,
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
          select: { slug: true, category: true, labelAr: true, labelEn: true },
        });
        for (const r of rows) types.push({ ...r, source: 'platform' });
      }

      return {
        ok: true,
        message: types.length
          ? `Found ${types.length} ticket type(s).`
          : 'No ticket types found. Use create_ticket_type to request a new service type (needs approval).',
        data: { types, count: types.length },
      };
    },
  });

  registerTool({
    id: 'create_ticket_type',
    name: 'Create ticket type',
    description:
      'Request a new ticket/service type (technique) when the user needs a type that is not in the catalog. Always requires owner approval. Tell the user clearly that it is pending until approved.',
    category: 'tickets',
    riskLevel: 'HIGH_IMPACT',
    requiresApproval: true,
    requiredPermissions: ['agent.create_ticket_type'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: createTicketTypeInput,
    jsonSchema: zodToJsonSchemaRough(createTicketTypeInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = createTicketTypeInput.parse(input);
      if (!ctx.privateCompanyId) {
        return {
          ok: false,
          message:
            'Workspace required to create custom ticket types. Personal accounts use platform catalog types.',
        };
      }
      const slug = slugifyTechnique(parsed.slug || parsed.labelEn || parsed.labelAr);
      const existing = await findTechniqueMatch({
        privateCompanyId: ctx.privateCompanyId,
        technique: slug,
      });
      if (existing.known) {
        return {
          ok: true,
          message: `Ticket type already exists: ${existing.slug} (${existing.label || existing.slug}). Use create_ticket with this slug.`,
          data: { alreadyExists: true, ...existing },
        };
      }
      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: 'create_ticket_type',
        action: `Create ticket type ${slug} (${parsed.category}) — ${parsed.labelAr}`,
        reason: parsed.labelEn || parsed.labelAr,
        riskLevel: 'HIGH_IMPACT',
        payload: {
          category: parsed.category,
          slug,
          labelAr: parsed.labelAr,
          labelEn: parsed.labelEn || null,
          companyId: ctx.privateCompanyId,
          requestedById: ctx.userId,
        },
        expectedResult: 'New PrivateCompanyTechnique row active',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: `New ticket type "${parsed.labelAr}" (${slug}) is PENDING APPROVAL (${approval.id}). Tell the user: not active until an owner/manager approves.`,
        data: {
          approvalId: approval.id,
          status: 'PENDING_APPROVAL',
          slug,
          category: parsed.category,
          labelAr: parsed.labelAr,
        },
      };
    },
  });

  registerTool({
    id: 'create_ticket',
    name: 'Create ticket',
    description:
      'Create a Proviser ticket for any role. Prefer list_ticket_types first. If the technique/service is missing, also call create_ticket_type and tell the user both requests need approval. Workspace tickets require owner approval.',
    category: 'tickets',
    riskLevel: 'HIGH_IMPACT',
    requiresApproval: true,
    requiredPermissions: ['agent.create_ticket'],
    enabled: true,
    version: '2',
    timeoutMs: 20000,
    inputSchema: createTicketInput,
    jsonSchema: zodToJsonSchemaRough(createTicketInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = createTicketInput.parse(input);
      const match = await findTechniqueMatch({
        privateCompanyId: ctx.privateCompanyId,
        technique: parsed.technique,
      });
      const techniqueSlug = match.known ? match.slug : slugifyTechnique(parsed.technique);
      const categoryGuess =
        parsed.category === 'MAINTENANCE' || parsed.category === 'INSPECTION_QC'
          ? parsed.category
          : /maint|صيان|fiber|فيبر/i.test(parsed.technique)
            ? 'MAINTENANCE'
            : 'INSPECTION_QC';

      let typeApprovalId: string | undefined;
      if (!match.known && ctx.privateCompanyId) {
        const typeApproval = await createApprovalRequest({
          privateCompanyId: ctx.privateCompanyId,
          requestedById: ctx.userId,
          toolId: 'create_ticket_type',
          action: `Create missing ticket type ${techniqueSlug} (${categoryGuess})`,
          reason: `Requested with ticket: ${parsed.notes || parsed.siteName || parsed.technique}`,
          riskLevel: 'HIGH_IMPACT',
          payload: {
            category: categoryGuess,
            slug: techniqueSlug,
            labelAr: parsed.technique,
            labelEn: parsed.technique,
            companyId: ctx.privateCompanyId,
            requestedById: ctx.userId,
          },
          expectedResult: 'New PrivateCompanyTechnique row active',
        });
        typeApprovalId = typeApproval.id;
      }

      // Personal / no-workspace: create immediately (user's own ticket)
      if (!ctx.privateCompanyId) {
        const requester = await prisma.ticketRequester.findUnique({
          where: { id: ctx.userId },
          select: { phone: true, province: true, name: true },
        });
        const ticket = await prisma.visitorRequest.create({
          data: {
            technique: techniqueSlug,
            status: 'PENDING',
            requesterId: ctx.userId,
            phone: requester?.phone || '0000000000',
            province: String(parsed.province || requester?.province || 'Baghdad'),
            name: requester?.name || null,
            siteName: parsed.siteName || null,
            company: JSON.stringify({
              notes: parsed.notes || null,
              category: parsed.category || null,
              createdVia: 'u_agent',
              techniqueKnown: match.known,
            }),
            serviceSlug: 'quality-control-supervision',
          },
          select: { id: true },
        });
        return {
          ok: true,
          message: match.known
            ? `Ticket created: ${ticket.id} (type ${techniqueSlug}).`
            : `Ticket created: ${ticket.id} using new technique slug "${techniqueSlug}" (not in platform catalog).`,
          data: {
            ticketId: ticket.id,
            technique: techniqueSlug,
            techniqueKnown: match.known,
            status: 'CREATED',
          },
        };
      }

      const company = await prisma.privateCompany.findUnique({
        where: { id: ctx.privateCompanyId },
        select: {
          id: true,
          freeTicketsLimit: true,
          ticketsUsed: true,
          ticketCreditsTotal: true,
          unlimitedUntil: true,
        },
      });
      if (workspaceTicketQuotaReached(company as WorkspaceBillingInput)) {
        return {
          ok: false,
          message: 'Workspace ticket quota reached. Purchase a plan or redeem an activation code.',
        };
      }

      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: 'create_ticket',
        action: `Create ticket (${techniqueSlug})${match.known ? '' : ' [NEW TYPE]'}`,
        reason: parsed.notes || parsed.siteName || null,
        riskLevel: 'HIGH_IMPACT',
        payload: {
          ...parsed,
          technique: techniqueSlug,
          requesterId: ctx.userId,
          privateCompanyId: ctx.privateCompanyId,
          techniqueKnown: match.known,
        },
        expectedResult: 'New VisitorRequest ticket created',
      });

      const pendingMsg = match.known
        ? `Ticket creation PENDING APPROVAL (${approval.id}). Tell the user to wait for owner/manager approval.`
        : `Service/type "${parsed.technique}" was NOT found. Queued: (1) new ticket type approval ${typeApprovalId}, (2) ticket create approval ${approval.id}. Tell the user clearly both are pending until approved.`;

      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: pendingMsg,
        data: {
          approvalId: approval.id,
          typeApprovalId: typeApprovalId ?? null,
          status: 'PENDING_APPROVAL',
          technique: techniqueSlug,
          techniqueKnown: match.known,
        },
      };
    },
  });

  registerTool({
    id: 'assign_ticket',
    name: 'Assign ticket',
    description: 'Assign a ticket to a requester (self if assignee omitted). Requires approval.',
    category: 'tickets',
    riskLevel: 'HIGH_IMPACT',
    requiresApproval: true,
    requiredPermissions: ['agent.assign_ticket'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: assignTicketInput,
    jsonSchema: zodToJsonSchemaRough(assignTicketInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = assignTicketInput.parse(input);
      const assignee = parsed.assigneeRequesterId || ctx.userId;
      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: 'assign_ticket',
        action: `Assign ticket ${parsed.ticketId} → ${assignee}`,
        riskLevel: 'HIGH_IMPACT',
        payload: { ticketId: parsed.ticketId, assigneeRequesterId: assignee, actorId: ctx.userId },
        expectedResult: 'Ticket assigned and status updated',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: 'Assignment queued for approval.',
        data: { approvalId: approval.id },
      };
    },
  });

  registerTool({
    id: 'report_conflict',
    name: 'Report conflict',
    description: 'Report an inspection conflict on a completed ticket. Requires approval.',
    category: 'conflicts',
    riskLevel: 'HIGH_IMPACT',
    requiresApproval: true,
    requiredPermissions: ['agent.report_conflict'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: conflictInput,
    jsonSchema: zodToJsonSchemaRough(conflictInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = conflictInput.parse(input);
      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: 'report_conflict',
        action: `Report conflict on ${parsed.ticketId} (${parsed.result})`,
        reason: parsed.comment || null,
        riskLevel: 'HIGH_IMPACT',
        payload: { ...parsed, actorId: ctx.userId },
        expectedResult: 'Conflict status set on ticket',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: 'Conflict report queued for approval.',
        data: { approvalId: approval.id },
      };
    },
  });

  registerTool({
    id: 'warehouse_read',
    name: 'Warehouse inventory summary',
    description: 'Read workspace warehouse materials/items summary (authorized roles only).',
    category: 'warehouse',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_warehouse'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: warehouseInput,
    jsonSchema: zodToJsonSchemaRough(warehouseInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      warehouseInput.parse(input);
      if (!ctx.privateCompanyId) {
        return { ok: false, message: 'Workspace required for warehouse read.' };
      }
      if (!prisma.privateCompanyMaterial?.findMany) {
        return { ok: false, message: 'Warehouse not available.' };
      }
      const limit = (input as { limit?: number })?.limit ?? 30;
      const materials = await prisma.privateCompanyMaterial.findMany({
        where: { companyId: ctx.privateCompanyId },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          category: true,
          unit: true,
          tracking: true,
          _count: { select: { items: true } },
        },
      });
      const itemStats = await prisma.privateCompanyMaterialItem.groupBy({
        by: ['status'],
        where: { companyId: ctx.privateCompanyId },
        _count: { _all: true },
      }).catch(() => []);
      return {
        ok: true,
        message: `Found ${materials.length} material type(s).`,
        data: { materials, itemStats },
      };
    },
  });
}
