import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';

const INBOUND_SECRET = process.env.COORDINATOR_INBOUND_SECRET;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  try {
    const crypto = require('crypto');
    const sortedKeys = Object.keys(params).sort();
    const data = url + sortedKeys.map((k) => k + params[k]).join('');
    const hmac = crypto.createHmac('sha1', authToken).update(data).digest('base64');
    return hmac === signature;
  } catch {
    return false;
  }
}

/**
 * Inbound WhatsApp webhook: create a task from message.
 * Twilio: POST with application/x-www-form-urlencoded (From, To, Body). Validate X-Twilio-Signature if TWILIO_AUTH_TOKEN set.
 * Other: POST JSON with X-Inbound-Secret or Authorization Bearer when COORDINATOR_INBOUND_SECRET is set.
 * Configure in Twilio Console: WhatsApp Sandbox or WhatsApp Sender → "When a message comes in" → this URL.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  let params: Record<string, string> = {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    for (const [k, v] of new URLSearchParams(text)) {
      params[k] = v;
    }
    if (TWILIO_AUTH_TOKEN) {
      const sig = req.headers.get('x-twilio-signature');
      if (!sig) return NextResponse.json({ success: false, message: 'Missing signature' }, { status: 403 });
      const url = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin + req.nextUrl.pathname;
      if (!validateTwilioSignature(TWILIO_AUTH_TOKEN, sig, url, params)) {
        return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 403 });
      }
    }
  } else {
    if (INBOUND_SECRET) {
      const secret = req.headers.get('x-inbound-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (secret !== INBOUND_SECRET) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
      }
    }
    const body = await req.json().catch(() => ({}));
    params = { From: body.From ?? body.from ?? '', Body: body.Body ?? body.body ?? '' };
  }

  const from = params.From ?? params.from ?? '';
  const messageText = (params.Body ?? params.body ?? '').trim();

  try {
    const title = messageText ? messageText.slice(0, 200).split('\n')[0] : 'رسالة واتساب';
    const description = messageText ? (from ? `من: ${from}\n\n${messageText}` : messageText) : (from ? `من: ${from}` : null);

    const companyId = process.env.TWILIO_COORDINATOR_COMPANY_ID;
    let company = companyId
      ? await prisma.coordinatorCompany.findFirst({ where: { id: companyId }, select: { id: true } })
      : null;
    if (!company) {
      company = await prisma.coordinatorCompany.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
    }
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
        source: 'whatsapp',
      },
    });
    return NextResponse.json({ success: true, taskId: task.id });
  } catch (e) {
    console.error('POST /api/coordinator/inbound/whatsapp:', e);
    return NextResponse.json({ success: false, message: 'Failed' }, { status: 500 });
  }
}
