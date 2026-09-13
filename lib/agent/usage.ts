import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function writeAgentAudit(input: {
  privateCompanyId: string | null;
  actorUserId: string | null;
  action: string;
  toolId?: string | null;
  permissions?: unknown;
  approvalId?: string | null;
  input?: unknown;
  result?: unknown;
  error?: string | null;
}): Promise<void> {
  try {
    if (!prisma.uAgentAuditLog?.create) return;
    await prisma.uAgentAuditLog.create({
      data: {
        privateCompanyId: input.privateCompanyId,
        actorUserId: input.actorUserId,
        action: input.action.slice(0, 120),
        toolId: input.toolId ?? null,
        permissions: input.permissions ?? undefined,
        approvalId: input.approvalId ?? null,
        input: input.input ?? undefined,
        result: input.result ?? undefined,
        error: input.error ? String(input.error).slice(0, 1000) : null,
      },
    });
  } catch (e) {
    console.error('writeAgentAudit:', e);
  }
}

export async function recordAgentUsage(input: {
  privateCompanyId: string | null;
  userId: string | null;
  resourceType: string;
  quantity?: number;
  provider?: string | null;
  model?: string | null;
  estimatedCost?: number | null;
  metadata?: unknown;
}): Promise<void> {
  try {
    if (!prisma.uAgentUsageRecord?.create) return;
    await prisma.uAgentUsageRecord.create({
      data: {
        privateCompanyId: input.privateCompanyId,
        userId: input.userId,
        resourceType: input.resourceType,
        quantity: input.quantity ?? 1,
        provider: input.provider ?? null,
        model: input.model ?? null,
        estimatedCost: input.estimatedCost ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (e) {
    console.error('recordAgentUsage:', e);
  }
}

export async function countTodayAiRequests(privateCompanyId: string | null): Promise<number> {
  if (!privateCompanyId || !prisma.uAgentUsageRecord?.count) return 0;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return await prisma.uAgentUsageRecord.count({
      where: {
        privateCompanyId,
        resourceType: 'ai_request',
        createdAt: { gte: start },
      },
    });
  } catch {
    return 0;
  }
}
