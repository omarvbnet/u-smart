import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * GET /api/agent/reports/daily
 * Simple workspace daily report for U Agent (Asia/Baghdad day window).
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!auth.capabilities.has('agent.read_kpis') && !auth.ctx.isWorkspaceOwner) {
    return NextResponse.json({ success: false, message: 'Not allowed' }, { status: 403 });
  }
  if (!auth.ctx.privateCompanyId) {
    return NextResponse.json({ success: false, message: 'Workspace required' }, { status: 400 });
  }

  const now = new Date();
  // Approximate Asia/Baghdad (+3) day start in UTC
  const baghdadOffsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() + baghdadOffsetMs);
  const startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const start = new Date(startLocal.getTime() - baghdadOffsetMs);

  const companyId = auth.ctx.privateCompanyId;

  const [tickets, approvals, executions, usage] = await Promise.all([
    prisma.visitorRequest.findMany({
      where: { privateCompanyId: companyId, createdAt: { gte: start } },
      select: { status: true },
    }).catch(() => []),
    prisma.uAgentApproval?.groupBy
      ? prisma.uAgentApproval.groupBy({
          by: ['status'],
          where: { privateCompanyId: companyId, createdAt: { gte: start } },
          _count: { _all: true },
        }).catch(() => [])
      : Promise.resolve([]),
    prisma.uAgentExecution?.count
      ? prisma.uAgentExecution.count({
          where: { privateCompanyId: companyId, createdAt: { gte: start } },
        }).catch(() => 0)
      : Promise.resolve(0),
    prisma.uAgentUsageRecord?.count
      ? prisma.uAgentUsageRecord.count({
          where: {
            privateCompanyId: companyId,
            resourceType: 'ai_request',
            createdAt: { gte: start },
          },
        }).catch(() => 0)
      : Promise.resolve(0),
  ]);

  const byStatus: Record<string, number> = {};
  for (const t of tickets as Array<{ status: string }>) {
    const s = String(t.status || 'UNKNOWN');
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  const approvalCounts: Record<string, number> = {};
  for (const a of approvals as Array<{ status: string; _count: { _all: number } }>) {
    approvalCounts[a.status] = a._count._all;
  }

  const report = {
    date: start.toISOString().slice(0, 10),
    timezone: 'Asia/Baghdad',
    tickets: { total: (tickets as unknown[]).length, byStatus },
    agentExecutions: executions,
    aiRequests: usage,
    approvals: approvalCounts,
    recommendations: [
      approvalCounts.PENDING
        ? `${approvalCounts.PENDING} approval(s) waiting — review in U Agent Approval Center.`
        : 'No pending approvals.',
      (tickets as unknown[]).length === 0
        ? 'No new tickets today.'
        : `Created ${(tickets as unknown[]).length} ticket(s) today.`,
    ],
  };

  return NextResponse.json({ success: true, report });
}
