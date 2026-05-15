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

/**
 * GET /api/provisor-private-company/expenses/settings
 * PATCH body:
 *   { reasons?: string[] }
 *   { enabled?: boolean } — owner/manager only (direct)
 *   { requestActivation?: true } — coordinator requests manager approval
 *   { approveActivation?: true } — owner/manager approves pending activation
 *   { rejectActivation?: true } — owner/manager rejects pending request
 *   { disable?: true } — owner/manager turns off expenses
 */
export async function GET(req: NextRequest) {
  const guard = await expensesGuard(req);
  if (!guard.ok) return guard.response;
  const row = await loadExpenseSettings(guard.companyId);
  if (!row) {
    return NextResponse.json({ success: false, message: 'Workspace not found.' }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    settings: serializeExpenseSettings(row),
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, message: 'No changes.' }, { status: 400 });
  }

  const updated = await prisma.privateCompany.update({
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

  return NextResponse.json({
    success: true,
    settings: serializeExpenseSettings(updated),
  });
}
