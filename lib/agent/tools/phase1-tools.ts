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

export function registerPhase1Tools(): void {
  registerTool({
    id: 'create_ticket',
    name: 'Create ticket',
    description:
      'Create a Proviser workspace ticket (technique + site). Always requires owner approval in Phase 1. Respects ticket quota.',
    category: 'tickets',
    riskLevel: 'HIGH_IMPACT',
    requiresApproval: true,
    requiredPermissions: ['agent.create_ticket'],
    enabled: true,
    version: '1',
    timeoutMs: 20000,
    inputSchema: createTicketInput,
    jsonSchema: zodToJsonSchemaRough(createTicketInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = createTicketInput.parse(input);
      if (!ctx.privateCompanyId) {
        return { ok: false, message: 'Workspace required to create tickets via U Agent.' };
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
        action: `Create ticket (${parsed.technique})`,
        reason: parsed.notes || parsed.siteName || null,
        riskLevel: 'HIGH_IMPACT',
        payload: { ...parsed, requesterId: ctx.userId, privateCompanyId: ctx.privateCompanyId },
        expectedResult: 'New VisitorRequest ticket created',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: 'Ticket creation queued for approval (quota OK).',
        data: { approvalId: approval.id },
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
