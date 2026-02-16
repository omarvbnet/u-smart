import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_COORDINATOR;

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;
        const planId = sub.metadata?.planId;
        if (!companyId || !planId) break;

        const existing = await prisma.coordinatorSubscription.findFirst({
          where: { stripeSubId: sub.id },
        });
        const periodEnd = (sub as { current_period_end?: number }).current_period_end;
        const data = {
          status: mapStripeStatus(sub.status),
          currentPeriodEnd: periodEnd != null ? new Date(periodEnd * 1000) : null,
        };
        if (existing) {
          await prisma.coordinatorSubscription.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await prisma.coordinatorSubscription.create({
            data: {
              companyId,
              planId,
              stripeSubId: sub.id,
              ...data,
            },
          });
        }
        if (data.status === 'ACTIVE') {
          await prisma.coordinatorCompany.update({
            where: { id: companyId },
            data: { subscriptionPlanId: planId },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.coordinatorSubscription.updateMany({
          where: { stripeSubId: sub.id },
          data: { status: 'CANCELED' },
        });
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as { subscription?: string | null }).subscription ?? null;
        if (!subId) break;
        const sub = await prisma.coordinatorSubscription.findFirst({
          where: { stripeSubId: subId },
        });
        if (!sub) break;
        const invPayload = inv as { amount_paid?: number; period_start?: number; period_end?: number };
        await prisma.coordinatorInvoice.create({
          data: {
            subscriptionId: sub.id,
            amountCents: invPayload.amount_paid ?? 0,
            periodFrom: invPayload.period_start != null ? new Date(invPayload.period_start * 1000) : new Date(),
            periodTo: invPayload.period_end != null ? new Date(invPayload.period_end * 1000) : new Date(),
          },
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('Stripe webhook handler error:', e);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(s: Stripe.Subscription.Status): 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED' {
  if (s === 'active') return 'ACTIVE';
  if (s === 'past_due') return 'PAST_DUE';
  if (s === 'canceled' || s === 'unpaid') return 'CANCELED';
  return 'SUSPENDED';
}
