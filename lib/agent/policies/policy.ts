import { prisma as _prisma } from '@/lib/prisma';
import type { AgentPolicySnapshot } from '@/lib/agent/types';
import { U_AGENT_DEFAULT_DAILY_LIMIT } from '@/lib/agent/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const DEFAULT_POLICY: AgentPolicySnapshot = {
  enabled: true,
  autonomyLevel: 1,
  allowedTools: null,
  maxTransactionIqd: 0,
  dailySpendLimitIqd: 0,
  dailyAiRequestLimit: U_AGENT_DEFAULT_DAILY_LIMIT,
  whatsappIngressEnabled: false,
};

function rowToSnapshot(row: Record<string, unknown>): AgentPolicySnapshot {
  const allowed = Array.isArray(row.allowedTools) ? (row.allowedTools as string[]) : null;
  return {
    enabled: row.enabled !== false,
    autonomyLevel: typeof row.autonomyLevel === 'number' ? row.autonomyLevel : 1,
    allowedTools: allowed,
    maxTransactionIqd: Number(row.maxTransactionIqd ?? 0),
    dailySpendLimitIqd: Number(row.dailySpendLimitIqd ?? 0),
    dailyAiRequestLimit:
      typeof row.dailyAiRequestLimit === 'number'
        ? row.dailyAiRequestLimit
        : U_AGENT_DEFAULT_DAILY_LIMIT,
    whatsappIngressEnabled: row.whatsappIngressEnabled === true,
  };
}

export async function getOrCreateAgentPolicy(
  privateCompanyId: string | null
): Promise<AgentPolicySnapshot> {
  if (!privateCompanyId || !prisma.uAgentPolicy?.findUnique) {
    return { ...DEFAULT_POLICY };
  }
  try {
    let row = await prisma.uAgentPolicy.findUnique({
      where: { privateCompanyId },
    });
    if (!row && prisma.uAgentPolicy.create) {
      row = await prisma.uAgentPolicy.create({
        data: {
          privateCompanyId,
          enabled: true,
          autonomyLevel: 1,
          maxTransactionIqd: 0,
          dailySpendLimitIqd: 0,
          dailyAiRequestLimit: U_AGENT_DEFAULT_DAILY_LIMIT,
          whatsappIngressEnabled: false,
        },
      });
    }
    if (!row) return { ...DEFAULT_POLICY };
    return rowToSnapshot(row);
  } catch (e) {
    console.error('getOrCreateAgentPolicy:', e);
    return { ...DEFAULT_POLICY };
  }
}

export async function updateAgentPolicy(
  privateCompanyId: string,
  patch: Partial<{
    enabled: boolean;
    autonomyLevel: number;
    allowedTools: string[] | null;
    maxTransactionIqd: number;
    dailySpendLimitIqd: number;
    dailyAiRequestLimit: number;
    whatsappIngressEnabled: boolean;
  }>
): Promise<AgentPolicySnapshot> {
  await getOrCreateAgentPolicy(privateCompanyId);
  const data: Record<string, unknown> = {};
  if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled;
  if (typeof patch.autonomyLevel === 'number') {
    data.autonomyLevel = Math.max(0, Math.min(5, Math.floor(patch.autonomyLevel)));
  }
  if (patch.allowedTools === null || Array.isArray(patch.allowedTools)) {
    data.allowedTools = patch.allowedTools;
  }
  if (typeof patch.maxTransactionIqd === 'number') {
    data.maxTransactionIqd = Math.max(0, patch.maxTransactionIqd);
  }
  if (typeof patch.dailySpendLimitIqd === 'number') {
    data.dailySpendLimitIqd = Math.max(0, patch.dailySpendLimitIqd);
  }
  if (typeof patch.dailyAiRequestLimit === 'number') {
    data.dailyAiRequestLimit = Math.max(1, Math.floor(patch.dailyAiRequestLimit));
  }
  if (typeof patch.whatsappIngressEnabled === 'boolean') {
    data.whatsappIngressEnabled = patch.whatsappIngressEnabled;
  }

  const row = await prisma.uAgentPolicy.update({
    where: { privateCompanyId },
    data,
  });
  return rowToSnapshot(row);
}

/** Autonomy gates risk: Level 0–1 = READ/LOW suggestions only without approval. */
export function autonomyAllowsRisk(
  autonomyLevel: number,
  risk: string,
  requiresApproval: boolean
): { ok: boolean; needsApproval: boolean } {
  if (requiresApproval) return { ok: true, needsApproval: true };
  const level = Math.max(0, Math.min(5, autonomyLevel));
  if (risk === 'READ' || risk === 'LOW') {
    if (level <= 1) return { ok: true, needsApproval: level === 0 };
    return { ok: true, needsApproval: false };
  }
  if (risk === 'EXTERNAL') {
    return { ok: true, needsApproval: level < 3 };
  }
  return { ok: true, needsApproval: true };
}
