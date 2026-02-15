import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSubscriptionConfirmation } from '@/lib/email';

function isPrismaInitError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name?: string }).name === 'PrismaClientInitializationError'
  );
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        success: false,
        message: 'Newsletter signup is temporarily unavailable. Please try again later.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email address' },
        { status: 400 }
      );
    }

    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      if (existing.active) {
        return NextResponse.json(
          { success: true, message: 'Already subscribed', alreadySubscribed: true },
          { status: 200 }
        );
      }
      await prisma.subscriber.update({
        where: { email },
        data: { active: true, name: name ?? existing.name },
      });
      await sendSubscriptionConfirmation(email, name ?? existing.name);
      return NextResponse.json({ success: true, message: 'Subscription reactivated' });
    }

    await prisma.subscriber.create({
      data: {
        email,
        name,
        active: true,
      },
    });

    await sendSubscriptionConfirmation(email, name);
    return NextResponse.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('POST /api/subscribe:', error);
    if (isPrismaInitError(error)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Newsletter signup is temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'Failed to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}
