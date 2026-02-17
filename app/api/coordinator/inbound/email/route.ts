import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';

const INBOUND_SECRET = process.env.COORDINATOR_INBOUND_SECRET;

/**
 * Inbound email webhook: create a task from email (subject = title, body = description).
 * Secure with COORDINATOR_INBOUND_SECRET (header X-Inbound-Secret or Authorization: Bearer <secret>).
 * Configure your email provider (SendGrid Inbound Parse, Mailgun, etc.) to POST to this URL.
 * Body: { from: string, subject: string, text: string } or provider-specific; we use subject and text.
 */
export async function POST(req: NextRequest) {
  if (INBOUND_SECRET) {
    const secret = req.headers.get('x-inbound-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (secret !== INBOUND_SECRET) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : (typeof body.body === 'string' ? body.body.trim() : '');
    const from = typeof body.from === 'string' ? body.from : '';

    const title = subject || 'مهمة من البريد';
    const description = text ? (from ? `من: ${from}\n\n${text}` : text) : (from ? `من: ${from}` : null);

    const company = await prisma.coordinatorCompany.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'No company' }, { status: 400 });
    }
    const admin = await prisma.coordinatorUser.findFirst({
      where: { companyId: company.id, role: CoordinatorRole.ADMIN },
      select: { id: true },
    });
    if (!admin) {
      return NextResponse.json({ success: false, message: 'No admin user' }, { status: 400 });
    }

    const task = await prisma.coordinatorTask.create({
      data: {
        title: title.slice(0, 500),
        description: description?.slice(0, 5000) ?? null,
        status: CoordinatorTaskStatus.PENDING,
        companyId: company.id,
        createdById: admin.id,
        source: 'email',
        coordinatorFeedback: `تم استلام البريد — ${new Date().toLocaleDateString('ar-IQ', { dateStyle: 'short' })}. بانتظار المتابعة وإضافة التغذية الراجعة.`,
      },
    });
    return NextResponse.json({ success: true, taskId: task.id });
  } catch (e) {
    console.error('POST /api/coordinator/inbound/email:', e);
    return NextResponse.json({ success: false, message: 'Failed' }, { status: 500 });
  }
}
