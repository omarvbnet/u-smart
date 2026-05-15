import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import {
  CAN_APPROVE_EXPENSE_ACTIVATION,
  CAN_CONFIGURE_EXPENSE_SETTINGS,
  CAN_ENABLE_EXPENSES_DIRECTLY,
  expensesGuard,
  loadExpenseSettings,
  normalizeExpenseReasons,
  serializeExpenseSettings,
} from '@/lib/private-company-expenses';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function fetchWorkspaceExpenseTechniques(companyId: string) {
  try {
    return await prisma.privateCompanyTechnique.findMany({
      where: { companyId, active: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
      select: {
        id: true,
        slug: true,
        category: true,
        labelAr: true,
        labelEn: true,
        ticketExpensesEnabled: true,
        ticketExpenseReasons: true,
      },
    });
  } catch {
    return [];
  }
}

function serializeWorkspaceExpenseTechniqueRow(t: {
  id: string;
  slug: string;
  category: string;
  labelAr: string;
  labelEn: string | null;
  ticketExpensesEnabled?: boolean | null;
  ticketExpenseReasons?: string[] | null;
}) {
  return {
    id: t.id,
    slug: t.slug,
    category: t.category,
    labelAr: t.labelAr,
    labelEn: t.labelEn ?? null,
    ticketExpensesEnabled: t.ticketExpensesEnabled !== false,
    ticketExpenseReasons: normalizeExpenseReasons(t.ticketExpenseReasons ?? []),
  };
}

/**
 * GET /api/provisor-private-company/expenses/settings
 * PATCH body:
 *   { reasons?: string[] }
 *   { enabled?: boolean } — owner/manager only (direct)
 *   { requestActivation?: true } — coordinator requests manager approval
 *   { approveActivation?: true } — owner/manager approves pending activation
 *   { rejectActivation?: true } — owner/manager rejects pending request
 *   { disable?: true } — owner/manager turns off expenses
 *   { techniquePatch?: { techniqueId, ticketExpensesEnabled?, reasons? } } — per workspace ticket type
 */
export async function GET(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;
  const row = await loadExpenseSettings(guard.companyId);
  if (!row) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  const techniques = await fetchWorkspaceExpenseTechniques(guard.companyId);
  return NextResponse.json({
    success: true,
    settings: serializeExpenseSettings(row),
    techniques: techniques.map(serializeWorkspaceExpenseTechniqueRow),
    canConfigure: guard.isOwner || CAN_CONFIGURE_EXPENSE_SETTINGS.has(guard.actorRole),
    canEnableDirectly: guard.isOwner || CAN_ENABLE_EXPENSES_DIRECTLY.has(guard.actorRole),
    canApproveActivation: guard.isOwner || CAN_APPROVE_EXPENSE_ACTIVATION.has(guard.actorRole),
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;

  if (!guard.isOwner && !CAN_CONFIGURE_EXPENSE_SETTINGS.has(guard.actorRole)) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only the workspace owner, manager, or coordinator can configure ticket expenses.',
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));

  let techniquePatchApplied = false;
  const tp = body?.techniquePatch;
  if (tp && typeof tp === 'object' && tp !== null && typeof (tp as { techniqueId?: unknown }).techniqueId === 'string') {
    const techniqueId = String((tp as { techniqueId: string }).techniqueId).trim();
    if (!techniqueId) {
      return NextResponse.json(
        { success: false, message: 'techniquePatch.techniqueId is required.' },
        { status: 400 }
      );
    }
    const owns = await prisma.privateCompanyTechnique.findFirst({
      where: { id: techniqueId, companyId: guard.companyId },
      select: { id: true },
    });
    if (!owns) {
      return NextResponse.json({ success: false, message: 'Technique not found.' }, { status: 404 });
    }
    const tPatch: Record<string, unknown> = {};
    if (typeof (tp as { ticketExpensesEnabled?: unknown }).ticketExpensesEnabled === 'boolean') {
      tPatch.ticketExpensesEnabled = (tp as { ticketExpensesEnabled: boolean }).ticketExpensesEnabled;
    }
    if ((tp as { reasons?: unknown }).reasons !== undefined) {
      tPatch.ticketExpenseReasons = normalizeExpenseReasons((tp as { reasons: unknown }).reasons);
    }
    if (Object.keys(tPatch).length === 0) {
      return NextResponse.json({ success: false, message: 'No technique changes.' }, { status: 400 });
    }
    await prisma.privateCompanyTechnique.update({
      where: { id: techniqueId },
      data: tPatch,
    });
    techniquePatchApplied = true;
  }

  const data: Record<string, unknown> = {};

  if (body?.reasons !== undefined) {
    data.ticketExpenseReasons = normalizeExpenseReasons(body.reasons);
  }

  const wantsDisable = body?.disable === true;
  const wantsEnable = body?.enabled === true;
  const wantsRequest = body?.requestActivation === true;
  const wantsApprove = body?.approveActivation === true;
  const wantsReject = body?.rejectActivation === true;

  if (wantsDisable) {
    if (!guard.isOwner && !CAN_ENABLE_EXPENSES_DIRECTLY.has(guard.actorRole)) {
      return NextResponse.json(
        { success: false, message: 'Only the owner or a manager can disable ticket expenses.' },
        { status: 403 }
      );
    }
    data.ticketExpensesEnabled = false;
    data.ticketExpensesActivationPending = false;
    data.ticketExpensesActivationRequestedAt = null;
    data.ticketExpensesActivationRequestedById = null;
  }

  if (wantsEnable) {
    if (!guard.isOwner && !CAN_ENABLE_EXPENSES_DIRECTLY.has(guard.actorRole)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Coordinators cannot enable expenses directly. Use requestActivation and ask a manager to approve.',
        },
        { status: 403 }
      );
    }
    data.ticketExpensesEnabled = true;
    data.ticketExpensesActivationPending = false;
    data.ticketExpensesActivationRequestedAt = null;
    data.ticketExpensesActivationRequestedById = null;
    data.ticketExpensesEnabledAt = new Date();
    data.ticketExpensesEnabledById = guard.requesterId;
  }

  if (wantsRequest) {
    if (guard.isOwner || CAN_ENABLE_EXPENSES_DIRECTLY.has(guard.actorRole)) {
      data.ticketExpensesEnabled = true;
      data.ticketExpensesActivationPending = false;
      data.ticketExpensesActivationRequestedAt = null;
      data.ticketExpensesActivationRequestedById = null;
      data.ticketExpensesEnabledAt = new Date();
      data.ticketExpensesEnabledById = guard.requesterId;
    } else if (guard.actorRole === 'COORDINATOR') {
      data.ticketExpensesActivationPending = true;
      data.ticketExpensesActivationRequestedAt = new Date();
      data.ticketExpensesActivationRequestedById = guard.requesterId;
    } else {
      return NextResponse.json({ success: false, message: 'Not allowed.' }, { status: 403 });
    }
  }

  if (wantsApprove || wantsReject) {
    if (!guard.isOwner && !CAN_APPROVE_EXPENSE_ACTIVATION.has(guard.actorRole)) {
      return NextResponse.json(
        { success: false, message: 'Only the owner or a manager can approve expense activation.' },
        { status: 403 }
      );
    }
    const current = await loadExpenseSettings(guard.companyId);
    if (!current?.ticketExpensesActivationPending && wantsApprove) {
      return NextResponse.json(
        { success: false, message: 'No pending expense activation request.' },
        { status: 400 }
      );
    }
    if (wantsApprove) {
      data.ticketExpensesEnabled = true;
      data.ticketExpensesActivationPending = false;
      data.ticketExpensesActivationRequestedAt = null;
      data.ticketExpensesActivationRequestedById = null;
      data.ticketExpensesEnabledAt = new Date();
      data.ticketExpensesEnabledById = guard.requesterId;
    } else {
      data.ticketExpensesActivationPending = false;
      data.ticketExpensesActivationRequestedAt = null;
      data.ticketExpensesActivationRequestedById = null;
    }
  }

  if (Object.keys(data).length === 0 && !techniquePatchApplied) {
    return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
  }

  if (Object.keys(data).length > 0) {
    await prisma.privateCompany.update({
      where: { id: guard.companyId },
      data,
      select: {
        ticketExpensesEnabled: true,
        ticketExpenseReasons: true,
        ticketExpensesActivationPending: true,
        ticketExpensesActivationRequestedAt: true,
        ticketExpensesActivationRequestedById: true,
        ticketExpensesEnabledAt: true,
        ticketExpensesEnabledById: true,
      },
    });
  }

  const latest = await loadExpenseSettings(guard.companyId);
  if (!latest) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  const techniques = await fetchWorkspaceExpenseTechniques(guard.companyId);

  return NextResponse.json({
    success: true,
    settings: serializeExpenseSettings(latest),
    techniques: techniques.map(serializeWorkspaceExpenseTechniqueRow),
  });
}
