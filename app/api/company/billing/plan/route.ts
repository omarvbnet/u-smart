import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoordinatorContext } from '@/lib/provider-company-auth';

const PLAN_RATE_USD: Record<string, number> = {
  WEEKLY: 0.7,
  MONTHLY: 0.6,
  YEARLY: 0.5,
};

const OWNER_ROLES = new Set(['COMPANY_OWNER', 'ADMIN']);

export async function GET(req: NextRequest) {
  const ctx = await getCoordinatorContext(req);
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
  const ctx = await getCoordinatorContext(req);
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
