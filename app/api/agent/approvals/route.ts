import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { listPendingApprovals } from '@/lib/agent/approvals/approvals';

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const canManage = auth.capabilities.has('agent.manage_approvals');
  const approvals = await listPendingApprovals({
    privateCompanyId: auth.ctx.privateCompanyId,
    userId: auth.ctx.userId,
    canManage,
  });

  return NextResponse.json({ success: true, approvals, canManage });
}
