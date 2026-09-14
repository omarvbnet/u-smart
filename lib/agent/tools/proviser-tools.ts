import { z } from 'zod';
import { prisma as _prisma } from '@/lib/prisma';
import { logPrivateCompanyWorkspaceActivity } from '@/lib/private-company-workspace-log';
import { phonesMatch } from '@/lib/phone-match';
import {
  registerTool,
  zodToJsonSchemaRough,
  type ToolResult,
} from '@/lib/agent/tools/registry';
import { createApprovalRequest } from '@/lib/agent/approvals/approvals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const OPEN_STATUSES = new Set([
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'ACCEPTED',
  'OPEN',
  'WAITING',
  'ON_HOLD',
]);

const searchTicketsInput = z.object({
  query: z.string().optional(),
  status: z.string().optional(),
  /** Match tickets assigned to / requested by this phone (Iraqi 07… OK). */
  phone: z.string().max(32).optional(),
  /** If true, only open/pending/in-progress tickets (remaining work). */
  remainingOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const getTicketInput = z.object({
  ticketId: z.string().min(1),
});

const listSitesInput = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const kpiInput = z.object({
  days: z.number().int().min(1).max(90).optional(),
});

const taskNoteInput = z.object({
  summary: z.string().min(1).max(500),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
});

const notifyInput = z.object({
  targetUserId: z.string().min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

const approvalInput = z.object({
  toolId: z.string().min(1),
  action: z.string().min(1),
  reason: z.string().optional(),
  amountIqd: z.number().optional(),
  payload: z.record(z.string(), z.any()).optional(),
  expectedResult: z.string().optional(),
});

function parseCompany(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function registerProviserTools(): void {
  registerTool({
    id: 'search_tickets',
    name: 'Search tickets',
    description:
      'Search Proviser tickets visible to the current user. Use remainingOnly=true for unfinished work. Use phone= to find remaining tickets for a person (assignee/requester). Call this BEFORE whatsapp_start_call / whatsapp_send_message when the user asks to call/tell someone about remaining tasks.',
    category: 'tickets',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_tickets'],
    enabled: true,
    version: '2',
    timeoutMs: 15000,
    inputSchema: searchTicketsInput,
    jsonSchema: zodToJsonSchemaRough(searchTicketsInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = searchTicketsInput.parse(input);
      const limit = parsed.limit ?? 20;
      const where: Record<string, unknown> = {};
      if (ctx.privateCompanyId) {
        where.OR = [
          { privateCompanyId: ctx.privateCompanyId },
          { requesterId: ctx.userId },
        ];
      } else {
        where.requesterId = ctx.userId;
      }
      if (parsed.status) where.status = parsed.status.toUpperCase();

      let assigneeId: string | null = null;
      const phoneQ = parsed.phone?.trim();
      if (phoneQ && ctx.privateCompanyId) {
        const people = await prisma.ticketRequester.findMany({
          where: {
            privateCompanyId: ctx.privateCompanyId,
            status: { not: 'BLOCKED' },
          },
          select: { id: true, phone: true, name: true, username: true },
          take: 200,
        });
        const hit = people.find((p: { phone: string }) => phonesMatch(p.phone || '', phoneQ));
        if (hit) assigneeId = hit.id;
      }

      const rows = await prisma.visitorRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(80, limit * 3),
        select: {
          id: true,
          status: true,
          technique: true,
          createdAt: true,
          company: true,
          requesterId: true,
          phone: true,
          siteName: true,
        },
      });

      const q = (parsed.query || '').trim().toLowerCase();
      const mapped = rows
        .map(
          (r: {
            id: string;
            status: string;
            technique: string;
            createdAt: Date;
            company: string | null;
            requesterId: string | null;
            phone: string | null;
            siteName: string | null;
          }) => {
            const c = parseCompany(r.company);
            return {
              id: r.id,
              status: r.status,
              technique: r.technique,
              siteName: r.siteName ?? c.siteName ?? null,
              assignedEngineerId: (c.assignedEngineerId as string) ?? null,
              assignedEngineerName: (c.assignedEngineerName as string) ?? null,
              requesterId: r.requesterId,
              phone: r.phone,
              createdAt: r.createdAt,
            };
          }
        )
        .filter(
          (r: {
            id: string;
            siteName: unknown;
            technique: string;
            status: string;
            assignedEngineerId: string | null;
            assignedEngineerName: string | null;
            requesterId: string | null;
            phone: string | null;
          }) => {
            if (parsed.remainingOnly && !OPEN_STATUSES.has(String(r.status || '').toUpperCase())) {
              return false;
            }
            if (assigneeId) {
              const matchAssignee =
                r.assignedEngineerId === assigneeId || r.requesterId === assigneeId;
              if (!matchAssignee) return false;
            } else if (phoneQ) {
              if (!phonesMatch(r.phone || '', phoneQ)) return false;
            }
            if (!q) return true;
            return (
              r.id.toLowerCase().includes(q) ||
              String(r.siteName || '').toLowerCase().includes(q) ||
              r.technique.toLowerCase().includes(q) ||
              r.status.toLowerCase().includes(q) ||
              String(r.assignedEngineerName || '').toLowerCase().includes(q)
            );
          }
        )
        .slice(0, limit);

      const briefingLines = mapped.map(
        (t: { id: string; status: string; technique: string; siteName: unknown }, i: number) =>
          `${i + 1}) ${t.technique} — ${t.status}${t.siteName ? ` @ ${t.siteName}` : ''} (${t.id.slice(0, 8)})`
      );

      return {
        ok: true,
        message: mapped.length
          ? `Found ${mapped.length} ticket(s)${parsed.remainingOnly ? ' remaining' : ''}${phoneQ ? ` for phone ${phoneQ}` : ''}. Use this list in WhatsApp note/message — do not invent tasks.`
          : phoneQ
            ? `No tickets matched phone ${phoneQ}. Still proceed with whatsapp_start_call using a short note that no open tickets were found in Proviser for this number, unless the user gave other details.`
            : 'No tickets found.',
        data: {
          tickets: mapped,
          count: mapped.length,
          briefingTextAr: mapped.length
            ? `التاسكات المتبقية:\n${briefingLines.join('\n')}`
            : 'لا توجد تاسكات مفتوحة مسجّلة في Proviser لهذا الرقم حالياً.',
          briefingTextEn: mapped.length
            ? `Remaining tasks:\n${briefingLines.join('\n')}`
            : 'No open tickets found in Proviser for this number right now.',
        },
      };
    },
  });

  registerTool({
    id: 'get_ticket',
    name: 'Get ticket',
    description: 'Get one ticket by id if the user can see it.',
    category: 'tickets',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_tickets'],
    enabled: true,
    version: '1',
    timeoutMs: 10000,
    inputSchema: getTicketInput,
    jsonSchema: zodToJsonSchemaRough(getTicketInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const { ticketId } = getTicketInput.parse(input);
      const row = await prisma.visitorRequest.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          status: true,
          technique: true,
          createdAt: true,
          completedAt: true,
          company: true,
          requesterId: true,
          privateCompanyId: true,
        },
      });
      if (!row) return { ok: false, message: 'Ticket not found.' };
      const allowed =
        row.requesterId === ctx.userId ||
        (ctx.privateCompanyId && row.privateCompanyId === ctx.privateCompanyId);
      if (!allowed) return { ok: false, message: 'Not allowed to view this ticket.' };
      const c = parseCompany(row.company);
      return {
        ok: true,
        message: 'Ticket loaded.',
        data: {
          id: row.id,
          status: row.status,
          technique: row.technique,
          createdAt: row.createdAt,
          completedAt: row.completedAt,
          siteName: c.siteName ?? null,
          assignedEngineerId: c.assignedEngineerId ?? null,
          assignedEngineerName: c.assignedEngineerName ?? null,
          conflictStatus: c.conflictStatus ?? null,
        },
      };
    },
  });

  registerTool({
    id: 'list_sites',
    name: 'List sites',
    description: 'List workspace or owned sites visible to the current user.',
    category: 'sites',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_sites'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: listSitesInput,
    jsonSchema: zodToJsonSchemaRough(listSitesInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = listSitesInput.parse(input);
      const limit = parsed.limit ?? 30;
      const q = (parsed.query || '').trim().toLowerCase();

      if (ctx.privateCompanyId && prisma.privateCompanySite?.findMany) {
        const rows = await prisma.privateCompanySite.findMany({
          where: { companyId: ctx.privateCompanyId },
          orderBy: { updatedAt: 'desc' },
          take: limit,
          select: {
            id: true,
            siteCode: true,
            location: true,
            province: true,
            confirmationStatus: true,
            hasQfield: true,
          },
        });
        const sites = rows.filter(
          (s: { siteCode: string; location: string; province: string }) =>
            !q ||
            s.siteCode.toLowerCase().includes(q) ||
            s.location.toLowerCase().includes(q) ||
            s.province.toLowerCase().includes(q)
        );
        return { ok: true, message: `Found ${sites.length} workspace site(s).`, data: { sites } };
      }

      const owned = await prisma.site.findMany({
        where: { requesterId: ctx.userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, siteId: true, name: true, province: true },
      });
      const sites = owned.filter(
        (s: { siteId: string; name: string | null; province: string | null }) =>
          !q ||
          s.siteId.toLowerCase().includes(q) ||
          String(s.name || '').toLowerCase().includes(q) ||
          String(s.province || '').toLowerCase().includes(q)
      );
      return { ok: true, message: `Found ${sites.length} site(s).`, data: { sites } };
    },
  });

  registerTool({
    id: 'get_workspace_kpis',
    name: 'Workspace KPIs',
    description: 'Summarize ticket counts by status for the current private company workspace.',
    category: 'analytics',
    riskLevel: 'READ',
    requiresApproval: false,
    requiredPermissions: ['agent.read_kpis'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: kpiInput,
    jsonSchema: zodToJsonSchemaRough(kpiInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      kpiInput.parse(input);
      if (!ctx.privateCompanyId) {
        return { ok: false, message: 'No private company workspace for KPIs.' };
      }
      const days = input && typeof (input as { days?: number }).days === 'number'
        ? (input as { days: number }).days
        : 7;
      const since = new Date(Date.now() - days * 86400000);
      const rows = await prisma.visitorRequest.findMany({
        where: {
          privateCompanyId: ctx.privateCompanyId,
          createdAt: { gte: since },
        },
        select: { status: true },
      });
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        const s = String(r.status || 'UNKNOWN');
        byStatus[s] = (byStatus[s] || 0) + 1;
      }
      return {
        ok: true,
        message: `KPI summary for last ${days} day(s).`,
        data: { days, total: rows.length, byStatus },
      };
    },
  });

  registerTool({
    id: 'create_task_note',
    name: 'Create task note',
    description: 'Write an audit/activity note in the private company workspace log.',
    category: 'tasks',
    riskLevel: 'LOW',
    requiresApproval: false,
    requiredPermissions: ['agent.create_task_note'],
    enabled: true,
    version: '1',
    timeoutMs: 10000,
    inputSchema: taskNoteInput,
    jsonSchema: zodToJsonSchemaRough(taskNoteInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = taskNoteInput.parse(input);
      if (!ctx.privateCompanyId) {
        return { ok: false, message: 'Workspace required to create a note.' };
      }
      logPrivateCompanyWorkspaceActivity({
        companyId: ctx.privateCompanyId,
        actorRequesterId: ctx.userId,
        action: 'U_AGENT_NOTE',
        resourceType: parsed.resourceType || 'u_agent',
        resourceId: parsed.resourceId || null,
        summary: parsed.summary,
        departmentId: ctx.departmentId,
        metadata: { source: 'u_agent' },
      });
      return { ok: true, message: 'Note recorded in workspace activity.', data: { summary: parsed.summary } };
    },
  });

  registerTool({
    id: 'send_in_app_notification',
    name: 'Send in-app notification',
    description: 'Send an in-app/push notification to a workspace user (management only).',
    category: 'notifications',
    riskLevel: 'EXTERNAL',
    requiresApproval: true,
    requiredPermissions: ['agent.send_notification'],
    enabled: true,
    version: '1',
    timeoutMs: 15000,
    inputSchema: notifyInput,
    jsonSchema: zodToJsonSchemaRough(notifyInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = notifyInput.parse(input);
      // Even if called directly, require approval path in v1 for EXTERNAL risk.
      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: 'send_in_app_notification',
        action: `Notify ${parsed.targetUserId}`,
        reason: parsed.body,
        riskLevel: 'EXTERNAL',
        payload: parsed,
        expectedResult: 'User receives in-app/push notification',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: 'Notification queued for owner approval.',
        data: { approvalId: approval.id },
      };
    },
  });

  registerTool({
    id: 'request_approval',
    name: 'Request approval',
    description: 'Create an approval request for a sensitive action.',
    category: 'approvals',
    riskLevel: 'LOW',
    requiresApproval: false,
    requiredPermissions: ['agent.request_approval'],
    enabled: true,
    version: '1',
    timeoutMs: 10000,
    inputSchema: approvalInput,
    jsonSchema: zodToJsonSchemaRough(approvalInput),
    async execute({ input, ctx }): Promise<ToolResult> {
      const parsed = approvalInput.parse(input);
      const approval = await createApprovalRequest({
        privateCompanyId: ctx.privateCompanyId,
        requestedById: ctx.userId,
        toolId: parsed.toolId,
        action: parsed.action,
        reason: parsed.reason,
        amountIqd: parsed.amountIqd,
        payload: parsed.payload,
        expectedResult: parsed.expectedResult,
        riskLevel: 'HIGH_IMPACT',
      });
      return {
        ok: true,
        needsApproval: true,
        approvalId: approval.id,
        message: 'Approval requested from workspace owner/admin.',
        data: { approvalId: approval.id },
      };
    },
  });
}

/** Execute a previously approved notification (called from approve route). */
export async function executeApprovedNotification(payload: {
  targetUserId: string;
  title: string;
  body: string;
}): Promise<ToolResult> {
  try {
    if (typeof prisma.notification?.create !== 'function') {
      return { ok: false, message: 'Notifications unavailable' };
    }
    await prisma.notification.create({
      data: {
        type: 'U_AGENT',
        title: payload.title.slice(0, 200),
        message: payload.body.slice(0, 1000),
        requesterId: payload.targetUserId,
        forAdmin: false,
      },
    });
    return { ok: true, message: 'Notification sent.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed to send notification' };
  }
}
