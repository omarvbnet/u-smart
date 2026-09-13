import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { updateAgentPolicy } from '@/lib/agent/policies/policy';
import { listTools } from '@/lib/agent/tools/registry';
import { registerProviserTools } from '@/lib/agent/tools/proviser-tools';
import { registerPhase1Tools } from '@/lib/agent/tools/phase1-tools';
import { writeAgentAudit } from '@/lib/agent/usage';

let registered = false;
function ensureToolsListed() {
  if (!registered) {
    registerProviserTools();
    registerPhase1Tools();
    registered = true;
  }
}

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  ensureToolsListed();
  const tools = listTools().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    riskLevel: t.riskLevel,
    requiresApproval: t.requiresApproval,
  }));

  return NextResponse.json({
    success: true,
    policy: auth.policy,
    canManage: auth.capabilities.has('agent.manage_policy'),
    tools,
    workspaceId: auth.ctx.privateCompanyId,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }
  if (!auth.capabilities.has('agent.manage_policy')) {
    return NextResponse.json({ success: false, message: 'Only workspace owners can edit U Agent policy' }, { status: 403 });
  }
  if (!auth.ctx.privateCompanyId) {
    return NextResponse.json({ success: false, message: 'Workspace required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  // Phase 1 owner UI: autonomy 0–2 only (higher levels reserved).
  let autonomyLevel: number | undefined;
  if (typeof body.autonomyLevel === 'number') {
    autonomyLevel = Math.max(0, Math.min(2, Math.floor(body.autonomyLevel)));
  }

  const patch: Parameters<typeof updateAgentPolicy>[1] = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (autonomyLevel !== undefined) patch.autonomyLevel = autonomyLevel;
  if (body.allowedTools === null) patch.allowedTools = null;
  if (Array.isArray(body.allowedTools)) {
    patch.allowedTools = body.allowedTools.filter((x): x is string => typeof x === 'string');
  }
  if (typeof body.maxTransactionIqd === 'number') patch.maxTransactionIqd = body.maxTransactionIqd;
  if (typeof body.dailySpendLimitIqd === 'number') patch.dailySpendLimitIqd = body.dailySpendLimitIqd;
  if (typeof body.dailyAiRequestLimit === 'number') patch.dailyAiRequestLimit = body.dailyAiRequestLimit;
  if (typeof body.whatsappIngressEnabled === 'boolean') {
    patch.whatsappIngressEnabled = body.whatsappIngressEnabled;
  }

  // Spend defaults remain 0 unless owner raises them explicitly.
  if (patch.maxTransactionIqd === undefined && body.resetSpend === true) {
    patch.maxTransactionIqd = 0;
    patch.dailySpendLimitIqd = 0;
  }

  try {
    const policy = await updateAgentPolicy(auth.ctx.privateCompanyId, patch);
    await writeAgentAudit({
      privateCompanyId: auth.ctx.privateCompanyId,
      actorUserId: auth.ctx.userId,
      action: 'POLICY_UPDATED',
      input: patch,
      result: policy,
    });
    return NextResponse.json({ success: true, policy });
  } catch (e) {
    console.error('PATCH /api/agent/policy:', e);
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'Failed to update policy' },
      { status: 500 }
    );
  }
}
