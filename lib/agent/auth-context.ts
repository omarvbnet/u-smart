import type { NextRequest } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { prisma as _prisma } from '@/lib/prisma';
import type { AgentContext } from '@/lib/agent/types';
import { resolveAgentCapabilities } from '@/lib/agent/permissions/capabilities';
import { isUAgentGloballyEnabled } from '@/lib/agent/config';
import { getOrCreateAgentPolicy } from '@/lib/agent/policies/policy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export type AgentAuthResult =
  | { ok: true; ctx: AgentContext; capabilities: ReturnType<typeof resolveAgentCapabilities>; policy: Awaited<ReturnType<typeof getOrCreateAgentPolicy>> }
  | { ok: false; status: number; message: string };

export async function resolveAgentAuth(req: NextRequest): Promise<AgentAuthResult> {
  if (!isUAgentGloballyEnabled()) {
    return { ok: false, status: 503, message: 'U Agent is disabled on this server' };
  }

  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return { ok: false, status: 401, message: 'Not authenticated' };
  }

  const membership = await getPrivateCompanyMembership(auth.payload.requesterId);
  let role = String(auth.payload.role || '').toUpperCase();
  let name: string | null = auth.payload.name ?? null;
  let departmentId: string | null = membership.departmentId;

  try {
    const user = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        role: true,
        name: true,
        preferredLocale: true,
        privateCompanyDepartmentId: true,
        privateCompanyOwned: { select: { id: true, status: true } },
      },
    });
    if (user) {
      role = String(user.role || role).toUpperCase();
      name = user.name ?? name;
      departmentId = user.privateCompanyDepartmentId ?? departmentId;
    }
  } catch {
    // ignore
  }

  const privateCompanyId = membership.effectiveCompanyId;
  const isWorkspaceOwner =
    membership.ownedCompanyId === privateCompanyId && membership.ownedCompanyId != null;

  const ctx: AgentContext = {
    userId: auth.payload.requesterId,
    username: auth.payload.username,
    name,
    role,
    privateCompanyId,
    isWorkspaceOwner,
    departmentId,
  };

  const policy = await getOrCreateAgentPolicy(privateCompanyId);
  if (privateCompanyId && !policy.enabled) {
    return { ok: false, status: 403, message: 'U Agent is disabled for this workspace' };
  }

  const capabilities = resolveAgentCapabilities(ctx);
  if (!capabilities.has('agent.use')) {
    return { ok: false, status: 403, message: 'U Agent not available for this role' };
  }

  return { ok: true, ctx, capabilities, policy };
}
