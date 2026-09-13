import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { prisma as _prisma } from '@/lib/prisma';
import { modelRouter } from '@/lib/agent/models/router';
import { U_AGENT_GREETING_AR } from '@/lib/agent/prompts/system';
import { listProviderHealth, pickDefaultProvider } from '@/lib/agent/providers/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  let status = 'ONLINE';
  let currentExecution: unknown = null;
  try {
    if (prisma.uAgentExecution?.findFirst) {
      const exec = await prisma.uAgentExecution.findFirst({
        where: {
          userId: auth.ctx.userId,
          status: {
            in: ['THINKING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'WAITING_EXTERNAL'],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (exec) {
        status = exec.status;
        currentExecution = exec;
      }
    }
  } catch {
    // ignore
  }

  const aiConfigured = await modelRouter.hasProvider();
  const defaultProvider = await pickDefaultProvider();
  const providers = await listProviderHealth();

  return NextResponse.json({
    success: true,
    status,
    greeting: U_AGENT_GREETING_AR,
    aiConfigured,
    activeProvider: defaultProvider
      ? { slug: defaultProvider.row.slug, name: defaultProvider.row.name, kind: defaultProvider.row.kind }
      : null,
    providers,
    policy: {
      enabled: auth.policy.enabled,
      autonomyLevel: auth.policy.autonomyLevel,
      dailyAiRequestLimit: auth.policy.dailyAiRequestLimit,
      whatsappIngressEnabled: auth.policy.whatsappIngressEnabled,
    },
    workspaceId: auth.ctx.privateCompanyId,
    role: auth.ctx.role,
    currentExecution,
  });
}
