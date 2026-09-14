import { prisma as _prisma } from '@/lib/prisma';
import { sendPushToRequesters } from '@/lib/push-notifications';
import type { AgentRiskLevel } from '@/lib/agent/types';
import { writeAgentAudit } from '@/lib/agent/usage';
import {
  executeApprovedAssignTicket,
  executeApprovedConflictReport,
  executeApprovedCreateTicket,
  executeApprovedCreateTicketType,
} from '@/lib/agent/tools/approved-actions';
import { executeApprovedNotification } from '@/lib/agent/tools/proviser-tools';
import {
  executeApprovedWhatsAppSendFile,
  executeApprovedWhatsAppSendMessage,
  executeApprovedWhatsAppStartCall,
} from '@/lib/agent/tools/whatsapp-tools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function notifyOwnersOfApproval(args: {
  privateCompanyId: string | null;
  approvalId: string;
  action: string;
  toolId: string;
  requestedById: string;
}): Promise<void> {
  try {
    const recipientIds = new Set<string>();
    if (args.privateCompanyId) {
      const company = await prisma.privateCompany.findUnique({
        where: { id: args.privateCompanyId },
        select: { ownerRequesterId: true },
      });
      if (company?.ownerRequesterId) recipientIds.add(company.ownerRequesterId);

      const managers = await prisma.ticketRequester.findMany({
        where: {
          privateCompanyId: args.privateCompanyId,
          role: { in: ['MANAGER', 'COORDINATOR'] },
          status: 'ACTIVE',
        },
        select: { id: true },
        take: 20,
      });
      for (const m of managers) recipientIds.add(m.id);
    }
    recipientIds.delete(args.requestedById);
    if (!recipientIds.size) return;

    const ids = [...recipientIds];
    for (const requesterId of ids) {
      try {
        if (prisma.notification?.create) {
          await prisma.notification.create({
            data: {
              type: 'U_AGENT_APPROVAL',
              title: 'U Agent needs approval',
              message: args.action.slice(0, 400),
              requesterId,
              forAdmin: false,
            },
          });
        }
      } catch {
        // ignore per-recipient failures
      }
    }

    await sendPushToRequesters(prisma, ids, {
      title: 'U Agent needs approval',
      body: args.action.slice(0, 140),
      data: {
        type: 'U_AGENT_APPROVAL',
        approvalId: args.approvalId,
        toolId: args.toolId,
      },
    });
  } catch (e) {
    console.error('notifyOwnersOfApproval:', e);
  }
}

async function notifyRequesterOfDecision(args: {
  requestedById: string;
  approvalId: string;
  toolId: string;
  decision: 'APPROVED' | 'REJECTED';
  action: string;
  resultMessage?: string;
}): Promise<void> {
  try {
    const title =
      args.decision === 'APPROVED' ? 'U Agent request approved' : 'U Agent request rejected';
    const body =
      (args.resultMessage || args.action).slice(0, 400) ||
      `${args.toolId} was ${args.decision.toLowerCase()}`;
    if (prisma.notification?.create) {
      await prisma.notification.create({
        data: {
          type: 'U_AGENT_APPROVAL_RESULT',
          title,
          message: body,
          requesterId: args.requestedById,
          forAdmin: false,
        },
      });
    }
    await sendPushToRequesters(prisma, [args.requestedById], {
      title,
      body: body.slice(0, 140),
      data: {
        type: 'U_AGENT_APPROVAL_RESULT',
        approvalId: args.approvalId,
        toolId: args.toolId,
        decision: args.decision,
      },
    });
  } catch (e) {
    console.error('notifyRequesterOfDecision:', e);
  }
}

export async function createApprovalRequest(input: {
  privateCompanyId: string | null;
  conversationId?: string | null;
  executionId?: string | null;
  requestedById: string;
  toolId: string;
  action: string;
  reason?: string | null;
  riskLevel?: AgentRiskLevel;
  amountIqd?: number | null;
  payload?: unknown;
  expectedResult?: string | null;
  expiresInHours?: number;
}): Promise<{ id: string }> {
  if (!prisma.uAgentApproval?.create) {
    throw new Error('U Agent approvals table not available. Run prisma migrate deploy.');
  }
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 24) * 3600_000);
  const row = await prisma.uAgentApproval.create({
    data: {
      privateCompanyId: input.privateCompanyId,
      conversationId: input.conversationId ?? null,
      executionId: input.executionId ?? null,
      requestedById: input.requestedById,
      toolId: input.toolId,
      action: input.action.slice(0, 500),
      reason: input.reason?.slice(0, 1000) ?? null,
      riskLevel: input.riskLevel ?? 'HIGH_IMPACT',
      amountIqd: input.amountIqd ?? null,
      currency: 'IQD',
      payload: input.payload ?? undefined,
      expectedResult: input.expectedResult ?? null,
      status: 'PENDING',
      expiresAt,
    },
    select: { id: true },
  });
  await writeAgentAudit({
    privateCompanyId: input.privateCompanyId,
    actorUserId: input.requestedById,
    action: 'APPROVAL_REQUIRED',
    toolId: input.toolId,
    approvalId: row.id,
    input: { action: input.action, reason: input.reason },
  });

  void notifyOwnersOfApproval({
    privateCompanyId: input.privateCompanyId,
    approvalId: row.id,
    action: input.action,
    toolId: input.toolId,
    requestedById: input.requestedById,
  });

  return row;
}

export async function listPendingApprovals(args: {
  privateCompanyId: string | null;
  userId: string;
  canManage: boolean;
}): Promise<unknown[]> {
  if (!prisma.uAgentApproval?.findMany) return [];
  const where: Record<string, unknown> = { status: 'PENDING' };
  if (args.canManage && args.privateCompanyId) {
    where.privateCompanyId = args.privateCompanyId;
  } else {
    where.requestedById = args.userId;
  }
  return prisma.uAgentApproval.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function resolveApproval(args: {
  approvalId: string;
  resolverUserId: string;
  privateCompanyId: string | null;
  canManage: boolean;
  decision: 'APPROVED' | 'REJECTED';
}): Promise<{ success: boolean; message: string; result?: unknown }> {
  if (!prisma.uAgentApproval?.findUnique) {
    return { success: false, message: 'Approvals unavailable' };
  }
  const row = await prisma.uAgentApproval.findUnique({ where: { id: args.approvalId } });
  if (!row) return { success: false, message: 'Approval not found' };
  if (row.status !== 'PENDING') {
    return { success: false, message: `Approval already ${row.status}` };
  }
  if (args.privateCompanyId && row.privateCompanyId && row.privateCompanyId !== args.privateCompanyId) {
    return { success: false, message: 'Not allowed' };
  }
  if (!args.canManage && row.requestedById !== args.resolverUserId) {
    return { success: false, message: 'Only workspace owners/managers can resolve approvals' };
  }

  await prisma.uAgentApproval.update({
    where: { id: args.approvalId },
    data: {
      status: args.decision,
      resolvedById: args.resolverUserId,
      resolvedAt: new Date(),
    },
  });

  await writeAgentAudit({
    privateCompanyId: row.privateCompanyId,
    actorUserId: args.resolverUserId,
    action: args.decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    toolId: row.toolId,
    approvalId: row.id,
  });

  let execResult: unknown = null;
  if (args.decision === 'APPROVED' && row.payload) {
    const payload = row.payload as Record<string, unknown>;
    if (row.toolId === 'send_in_app_notification') {
      const p = payload as { targetUserId?: string; title?: string; body?: string };
      if (p.targetUserId && p.title && p.body) {
        execResult = await executeApprovedNotification({
          targetUserId: p.targetUserId,
          title: p.title,
          body: p.body,
        });
      }
    } else if (row.toolId === 'create_ticket') {
      execResult = await executeApprovedCreateTicket(payload);
    } else if (row.toolId === 'create_ticket_type') {
      execResult = await executeApprovedCreateTicketType(payload);
    } else if (row.toolId === 'assign_ticket') {
      execResult = await executeApprovedAssignTicket(payload);
    } else if (row.toolId === 'report_conflict') {
      execResult = await executeApprovedConflictReport(payload);
    } else if (row.toolId === 'whatsapp_send_message') {
      execResult = await executeApprovedWhatsAppSendMessage(payload);
    } else if (row.toolId === 'whatsapp_send_file') {
      execResult = await executeApprovedWhatsAppSendFile(payload);
    } else if (row.toolId === 'whatsapp_start_call') {
      execResult = await executeApprovedWhatsAppStartCall(payload);
    }
  }

  const resultMessage =
    execResult && typeof execResult === 'object' && 'message' in execResult
      ? String((execResult as { message?: unknown }).message || '')
      : undefined;

  void notifyRequesterOfDecision({
    requestedById: row.requestedById,
    approvalId: row.id,
    toolId: row.toolId,
    decision: args.decision,
    action: row.action,
    resultMessage,
  });

  return {
    success: true,
    message: args.decision === 'APPROVED' ? 'Approved' : 'Rejected',
    result: execResult,
  };
}
