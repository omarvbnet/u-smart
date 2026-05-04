import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getLinkedCoordinatorCompanyId } from '@/lib/linked-coordinator-company';

const PLAN_RATE_USD: Record<string, number> = {
  WEEKLY: 0.7,
  MONTHLY: 0.6,
  YEARLY: 0.5,
};

const OWNER_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'COMPANY']);

async function resolveBillingContext(req: NextRequest): Promise<{ companyId: string; role: string } | null> {
  const ctx = await getCoordinatorContext(req);
  if (ctx) return { companyId: ctx.companyId, role: ctx.role };

  const auth = getRequesterFromRequest(req);
  if (!auth || auth.payload.identitySource !== 'ticket_requester') return null;
  const tr = await (prisma as any).ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true, username: true, email: true, status: true },
  });
  const role = String((tr as { role?: string })?.role ?? '').toUpperCase();
  const status = String((tr as { status?: string })?.status ?? 'ACTIVE').toUpperCase();
  if (role !== 'COMPANY' || status === 'BLOCKED' || status === 'SUSPENDED') return null;
  const companyId = await getLinkedCoordinatorCompanyId(prisma as any, {
    id: auth.payload.requesterId as string,
    username: (tr as { username?: string }).username ?? '',
    email: (tr as { email?: string | null }).email ?? null,
    role,
  });
  if (!companyId) return null;
  return { companyId, role };
}

export async function GET(req: NextRequest) {
  const ctx = await resolveBillingContext(req);
  if (!ctx) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const company = await (prisma as any).coordinatorCompany.findUnique({
    where: { id: ctx.companyId },
    select: {
      id: true,
      name: true,
      freeTicketsUsed: true,
      freeTicketsLimit: true,
      activeTicketPlan: true,
      ticketPlanActivatedAt: true,
    },
  });
  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }
  const activePlan = company.activeTicketPlan as string | null;
  return NextResponse.json({
    success: true,
    billing: {
      freeTicketsUsed: company.freeTicketsUsed ?? 0,
      freeTicketsLimit: company.freeTicketsLimit ?? 50,
      activeTicketPlan: activePlan,
      activeRateUsd: activePlan ? PLAN_RATE_USD[activePlan] : null,
      ticketPlanActivatedAt: company.ticketPlanActivatedAt ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveBillingContext(req);
  if (!ctx) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!OWNER_ROLES.has(ctx.role)) {
    return NextResponse.json({ success: false, message: 'Only company owner can update billing plan.' }, { status: 403 });
  }

  const body = await req.json();
  const plan = typeof body.plan === 'string' ? body.plan.toUpperCase() : '';
  if (!PLAN_RATE_USD[plan]) {
    return NextResponse.json({ success: false, message: 'Invalid plan. Use WEEKLY, MONTHLY, or YEARLY.' }, { status: 400 });
  }

  const company = await (prisma as any).coordinatorCompany.update({
    where: { id: ctx.companyId },
    data: {
      activeTicketPlan: plan,
      ticketPlanActivatedAt: new Date(),
    },
    select: {
      freeTicketsUsed: true,
      freeTicketsLimit: true,
      activeTicketPlan: true,
      ticketPlanActivatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    billing: {
      freeTicketsUsed: company.freeTicketsUsed ?? 0,
      freeTicketsLimit: company.freeTicketsLimit ?? 50,
      activeTicketPlan: company.activeTicketPlan,
      activeRateUsd: PLAN_RATE_USD[company.activeTicketPlan as string] ?? null,
      ticketPlanActivatedAt: company.ticketPlanActivatedAt ?? null,
    },
  });
}
