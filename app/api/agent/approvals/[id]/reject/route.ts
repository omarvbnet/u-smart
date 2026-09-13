import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { resolveApproval } from '@/lib/agent/approvals/approvals';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<unknown> }
) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const resolved = await params;
  const id =
    resolved && typeof resolved === 'object' && typeof (resolved as { id?: unknown }).id === 'string'
      ? (resolved as { id: string }).id
      : null;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing approval id' }, { status: 400 });
  }

  const result = await resolveApproval({
    approvalId: id,
    resolverUserId: auth.ctx.userId,
    privateCompanyId: auth.ctx.privateCompanyId,
    canManage: auth.capabilities.has('agent.manage_approvals'),
    decision: 'REJECTED',
  });

  return NextResponse.json(
    { success: result.success, message: result.message },
    { status: result.success ? 200 : 400 }
  );
}
