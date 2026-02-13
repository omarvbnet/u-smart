import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { sendSubscriptionConfirmation, sendTrainingRequestConfirmation } from '@/lib/email';

/**
 * Resend transactional emails:
 * - type: 'subscription' → resend newsletter confirmation (no auth)
 * - type: 'training' → resend training request confirmation (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type === 'subscription' || body.type === 'training' ? body.type : null;

    if (!type) {
      return NextResponse.json(
        { success: false, message: 'Invalid type. Use "subscription" or "training".' },
        { status: 400 }
      );
    }

    if (type === 'subscription') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email) {
        return NextResponse.json(
          { success: false, message: 'Email is required for subscription resend.' },
          { status: 400 }
        );
      }
      const subscriber = await prisma.subscriber.findUnique({ where: { email }, select: { name: true } });
      const sent = await sendSubscriptionConfirmation(email, subscriber?.name ?? undefined);
      if (!sent) {
        return NextResponse.json(
          { success: false, message: 'Failed to send email. Please try again later.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, message: 'Confirmation email resent.' });
    }

    if (type === 'training') {
      const token = req.cookies.get(COOKIE_NAME)?.value;
      if (!token || !verifyToken(token)) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
      }
      const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
      if (!requestId) {
        return NextResponse.json(
          { success: false, message: 'requestId is required for training resend.' },
          { status: 400 }
        );
      }
      const training = await prisma.trainingRequest.findUnique({
        where: { id: requestId },
        select: {
          requesterName: true,
          requesterEmail: true,
          serviceTitle: true,
          serviceSlug: true,
          company: true,
          message: true,
          budget: true,
        },
      });
      if (!training) {
        return NextResponse.json({ success: false, message: 'Training request not found.' }, { status: 404 });
      }
      const sent = await sendTrainingRequestConfirmation(training.requesterEmail, {
        requesterName: training.requesterName,
        requesterEmail: training.requesterEmail,
        serviceTitle: training.serviceTitle,
        serviceSlug: training.serviceSlug,
        company: training.company,
        message: training.message,
        budget: training.budget,
      });
      if (!sent) {
        return NextResponse.json(
          { success: false, message: 'Failed to send email. Please try again later.' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, message: 'Confirmation email resent to requester.' });
    }

    return NextResponse.json({ success: false, message: 'Invalid type.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/resend-email:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to resend email.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
