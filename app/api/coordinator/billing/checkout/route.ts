import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
    if (!stripe) {
      return NextResponse.json({ success: false, message: 'Billing not configured' }, { status: 503 });
    }

    const body = await req.json();
    const planTier = body.planTier as string | undefined; // BASIC | PROFESSIONAL | ENTERPRISE
    const successUrl = typeof body.successUrl === 'string' ? body.successUrl : undefined;
    const cancelUrl = typeof body.cancelUrl === 'string' ? body.cancelUrl : undefined;

    const plan = await prisma.coordinatorSubscriptionPlan.findUnique({
      where: { tier: planTier as 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE' },
    });
    if (!plan || !plan.stripePriceId) {
      return NextResponse.json({ success: false, message: 'Invalid plan or Stripe price not set' }, { status: 400 });
    }

    const company = await prisma.coordinatorCompany.findUnique({
      where: { id: payload.companyId },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const success = successUrl || `${baseUrl}/coordinator/billing?success=1`;
    const cancel = cancelUrl || `${baseUrl}/coordinator/billing?canceled=1`;

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: payload.email,
        name: company.name,
        metadata: { coordinatorCompanyId: company.id },
      });
      customerId = customer.id;
      await prisma.coordinatorCompany.update({
        where: { id: company.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      metadata: { companyId: company.id, planId: plan.id },
      subscription_data: { metadata: { companyId: company.id, planId: plan.id } },
    });

    return NextResponse.json({ success: true, url: session.url, sessionId: session.id });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/billing/checkout:', e);
    return NextResponse.json({ success: false, message: 'Checkout failed' }, { status: 500 });
  }
}
