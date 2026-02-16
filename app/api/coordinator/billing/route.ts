import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);

    const company = await prisma.coordinatorCompany.findUnique({
      where: { id: payload.companyId },
      include: {
        subscriptionPlan: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const activeSub = company.subscriptions[0] ?? null;
    const invoices = activeSub
      ? await prisma.coordinatorInvoice.findMany({
          where: { subscriptionId: activeSub.id },
          orderBy: { createdAt: 'desc' },
          take: 24,
        })
      : [];

    const plans = await prisma.coordinatorSubscriptionPlan.findMany({
      orderBy: { amountCents: 'asc' },
    });

    return NextResponse.json({
      success: true,
      company: {
        name: company.name,
        currentPlan: company.subscriptionPlan
          ? { tier: company.subscriptionPlan.tier, name: company.subscriptionPlan.name, amountCents: company.subscriptionPlan.amountCents, interval: company.subscriptionPlan.interval }
          : null,
      },
      subscription: activeSub
        ? {
            id: activeSub.id,
            status: activeSub.status,
            currentPeriodEnd: activeSub.currentPeriodEnd,
            plan: activeSub.plan ? { tier: activeSub.plan.tier, name: activeSub.plan.name } : null,
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        amountCents: i.amountCents,
        periodFrom: i.periodFrom,
        periodTo: i.periodTo,
        pdfUrl: i.pdfUrl,
        createdAt: i.createdAt,
      })),
      plans: plans.map((p) => ({
        id: p.id,
        tier: p.tier,
        name: p.name,
        amountCents: p.amountCents,
        interval: p.interval,
        stripePriceId: p.stripePriceId ? true : false,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/billing:', e);
    return NextResponse.json({ success: false, message: 'Failed to load billing' }, { status: 500 });
  }
}
