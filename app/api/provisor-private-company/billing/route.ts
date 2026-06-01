import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { logPrivateCompanyWorkspaceActivity } from '@/lib/private-company-workspace-log';
import {
  computeWorkspaceBilling,
  isValidTicketPlan,
  PLAN_TICKET_CREDITS,
} from '@/lib/private-company-billing';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

interface WorkspaceContext {
  requester: { id: string; role: string | null; phone: string | null; name: string | null };
  role: string;
  companyId: string | null;
  isOwner: boolean;
  status: string | null;
  /** Owner or MANAGER may request plans and redeem codes. */
  canManage: boolean;
}

async function resolveWorkspaceContext(requesterId: string): Promise<WorkspaceContext | null> {
  const r = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: {
      id: true,
      role: true,
      phone: true,
      name: true,
      privateCompanyId: true,
      privateCompanyOwned: { select: { id: true, status: true } },
    },
  });
  if (!r) return null;
  const role = String(r.role ?? '').toUpperCase();
  let companyId: string | null = null;
  let isOwner = false;
  let status: string | null = null;
  if (r.privateCompanyOwned) {
    companyId = r.privateCompanyOwned.id;
    isOwner = true;
    status = r.privateCompanyOwned.status ?? null;
  } else if (r.privateCompanyId) {
    companyId = r.privateCompanyId;
    const ws = await prisma.privateCompany.findUnique({
      where: { id: companyId },
      select: { status: true },
    });
    status = ws?.status ?? null;
  }
  const canManage = isOwner || role === 'MANAGER';
  return {
    requester: { id: r.id, role: r.role ?? null, phone: r.phone ?? null, name: r.name ?? null },
    role,
    companyId,
    isOwner,
    status,
    canManage,
  };
}

async function loadBilling(companyId: string) {
  const row = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: {
      freeTicketsLimit: true,
      ticketsUsed: true,
      ticketCreditsTotal: true,
      unlimitedUntil: true,
    },
  });
  return computeWorkspaceBilling(row);
}

/**
 * GET /api/provisor-private-company/billing
 * Returns the workspace billing snapshot plus recent plan requests and codes.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const ctx = await resolveWorkspaceContext(auth.payload.requesterId);
    if (!ctx || !ctx.companyId) {
      return NextResponse.json({ success: false, message: 'No workspace found.' }, { status: 404 });
    }
    const billing = await loadBilling(ctx.companyId);
    const planRequests = await prisma.privateCompanyPlanRequest
      .findMany({
        where: { companyId: ctx.companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, planType: true, status: true, contactPhone: true, createdAt: true },
      })
      .catch(() => []);
    const activationCodes = await prisma.privateCompanyActivationCode
      .findMany({
        where: { companyId: ctx.companyId, status: { in: ['REDEEMED', 'REVOKED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, planType: true, status: true, redeemedAt: true, createdAt: true },
      })
      .catch(() => []);
    return NextResponse.json({
      success: true,
      canManageBilling: ctx.canManage,
      billing,
      planRequests,
      activationCodes,
    });
  } catch (err) {
    console.error('GET /api/provisor-private-company/billing:', err);
    return NextResponse.json({ success: false, message: 'Failed to load billing.' }, { status: 500 });
  }
}

/**
 * POST /api/provisor-private-company/billing
 * Body: { action: 'request', planType, phone? } | { action: 'redeem', code }
 * Owner or MANAGER only.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const ctx = await resolveWorkspaceContext(auth.payload.requesterId);
    if (!ctx || !ctx.companyId) {
      return NextResponse.json({ success: false, message: 'No workspace found.' }, { status: 404 });
    }
    if (ctx.status !== 'APPROVED') {
      return NextResponse.json(
        { success: false, message: 'Your workspace must be approved first.' },
        { status: 403 }
      );
    }
    if (!ctx.canManage) {
      return NextResponse.json(
        { success: false, message: 'Only the workspace owner or a manager can manage ticket plans.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (action === 'request') {
      const planType = typeof body?.planType === 'string' ? body.planType.trim().toUpperCase() : '';
      if (!isValidTicketPlan(planType)) {
        return NextResponse.json({ success: false, message: 'Invalid plan type.' }, { status: 400 });
      }
      const phoneRaw = typeof body?.phone === 'string' ? body.phone.trim() : '';
      const phone = phoneRaw || ctx.requester.phone || '';
      if (!phone) {
        return NextResponse.json(
          { success: false, message: 'A contact phone number is required.' },
          { status: 400 }
        );
      }
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : '';

      const planRequest = await prisma.privateCompanyPlanRequest.create({
        data: {
          companyId: ctx.companyId,
          requestedById: ctx.requester.id,
          planType,
          contactPhone: phone,
          note: note || null,
        },
        select: { id: true, planType: true, status: true, contactPhone: true, createdAt: true },
      });

      // Admin alert (graceful if the notification table/forAdmin is missing).
      try {
        if (typeof prisma.notification?.create === 'function') {
          const company = await prisma.privateCompany.findUnique({
            where: { id: ctx.companyId },
            select: { name: true },
          });
          await prisma.notification.create({
            data: {
              type: 'private_company_plan_request',
              title: 'New ticket plan request',
              message: `${ctx.requester.name ?? 'A workspace'} (${
                company?.name ?? ctx.companyId
              }) requested plan ${planType}. Contact: ${phone}.`,
              forAdmin: true,
              payload: {
                companyId: ctx.companyId,
                planRequestId: planRequest.id,
                planType,
                phone,
              },
            },
          });
        }
      } catch (e) {
        console.error('Notify admin (plan request):', e);
      }

      try {
        logPrivateCompanyWorkspaceActivity({
          companyId: ctx.companyId,
          actorRequesterId: ctx.requester.id,
          action: 'TICKET_PLAN_REQUESTED',
          resourceType: 'plan_request',
          resourceId: planRequest.id,
          summary: `Requested ticket plan ${planType}`,
          metadata: { planType, phone },
        });
      } catch {
        /* non-fatal */
      }

      return NextResponse.json({
        success: true,
        message: 'Your plan request was sent. An admin will send you an activation code shortly.',
        planRequest,
      });
    }

    if (action === 'redeem') {
      const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
      if (!code) {
        return NextResponse.json({ success: false, message: 'Enter an activation code.' }, { status: 400 });
      }

      // Find the code first to give precise errors (wrong company vs already used).
      const existing = await prisma.privateCompanyActivationCode.findUnique({
        where: { code },
        select: {
          id: true,
          companyId: true,
          planType: true,
          ticketCredits: true,
          unlimitedUntil: true,
          status: true,
          planRequestId: true,
        },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, message: 'This activation code is not valid.' },
          { status: 404 }
        );
      }
      if (existing.companyId !== ctx.companyId) {
        return NextResponse.json(
          { success: false, message: 'This activation code was not issued for your company.' },
          { status: 403 }
        );
      }
      if (existing.status !== 'ACTIVE') {
        return NextResponse.json(
          {
            success: false,
            message:
              existing.status === 'REDEEMED'
                ? 'This activation code has already been used.'
                : 'This activation code is no longer valid.',
          },
          { status: 409 }
        );
      }

      const now = new Date();
      await prisma.$transaction(async (tx: any) => {
        // Conditional update so two redeem attempts can't both succeed.
        const claim = await tx.privateCompanyActivationCode.updateMany({
          where: { id: existing.id, status: 'ACTIVE' },
          data: {
            status: 'REDEEMED',
            redeemedByRequesterId: ctx.requester.id,
            redeemedAt: now,
          },
        });
        if (claim.count !== 1) {
          throw new Error('CODE_ALREADY_REDEEMED');
        }

        const company = await tx.privateCompany.findUnique({
          where: { id: ctx.companyId },
          select: { unlimitedUntil: true },
        });
        const data: Record<string, unknown> = {};
        if (existing.ticketCredits && existing.ticketCredits > 0) {
          data.ticketCreditsTotal = { increment: existing.ticketCredits };
        }
        if (existing.unlimitedUntil) {
          const current = company?.unlimitedUntil ? new Date(company.unlimitedUntil) : null;
          const incoming = new Date(existing.unlimitedUntil);
          data.unlimitedUntil =
            current && current.getTime() > incoming.getTime() ? current : incoming;
        }
        if (Object.keys(data).length > 0) {
          await tx.privateCompany.update({ where: { id: ctx.companyId }, data });
        }
        if (existing.planRequestId) {
          await tx.privateCompanyPlanRequest.updateMany({
            where: { id: existing.planRequestId, status: 'PENDING' },
            data: { status: 'FULFILLED' },
          });
        }
      });

      try {
        logPrivateCompanyWorkspaceActivity({
          companyId: ctx.companyId,
          actorRequesterId: ctx.requester.id,
          action: 'TICKET_PLAN_ACTIVATED',
          resourceType: 'activation_code',
          resourceId: existing.id,
          summary: `Activated ticket plan ${existing.planType}`,
          metadata: {
            planType: existing.planType,
            ticketCredits: existing.ticketCredits,
            unlimitedUntil: existing.unlimitedUntil,
          },
        });
      } catch {
        /* non-fatal */
      }

      const billing = await loadBilling(ctx.companyId);
      return NextResponse.json({
        success: true,
        message: 'Activation code applied. Your workspace can create tickets again.',
        planType: existing.planType,
        billing,
      });
    }

    return NextResponse.json({ success: false, message: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    const e = err as Error;
    if (e?.message === 'CODE_ALREADY_REDEEMED') {
      return NextResponse.json(
        { success: false, message: 'This activation code has already been used.' },
        { status: 409 }
      );
    }
    console.error('POST /api/provisor-private-company/billing:', e?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to process billing request.' }, { status: 500 });
  }
}
