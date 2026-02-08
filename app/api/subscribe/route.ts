import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
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
        data: { active: true, name: body.name?.trim() || null },
      });
      return NextResponse.json({ success: true, message: 'Subscription reactivated' });
    }

    await prisma.subscriber.create({
      data: {
        email,
        name: body.name?.trim() || null,
        active: true,
      },
    });

    return NextResponse.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('POST /api/subscribe:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}
