import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VoiceCallDirection, CoordinatorRole, CoordinatorTaskStatus } from '@prisma/client';

/**
 * Twilio voice webhook: incoming call handler.
 * Configure in Twilio Console: Phone Number → Voice & Fax → A CALL COMES IN → Webhook: https://yourdomain.com/api/coordinator/voice/webhook/incoming
 * Env: TWILIO_COORDINATOR_COMPANY_ID (optional, default: first company); TWILIO_AUTH_TOKEN (optional, for signature validation).
 * Returns TwiML to greet and hang up (or extend with <Gather>, <Dial>, etc.).
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let params: Record<string, string> = {};
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      for (const pair of new URLSearchParams(text)) {
        params[pair[0]] = pair[1];
      }
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const sig = req.headers.get('x-twilio-signature');
    if (authToken && sig) {
      const url = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin + req.nextUrl.pathname;
      const valid = validateTwilioSignature(authToken, sig, url, params);
      if (!valid) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const companyId = process.env.TWILIO_COORDINATOR_COMPANY_ID;
    let resolvedCompanyId: string | null = companyId || null;
    if (!resolvedCompanyId) {
      const first = await prisma.coordinatorCompany.findFirst({ select: { id: true } });
      resolvedCompanyId = first?.id ?? null;
    }
    if (resolvedCompanyId) {
      const callRecord = await prisma.coordinatorVoiceCallRecord.create({
        data: {
          companyId: resolvedCompanyId,
          direction: VoiceCallDirection.INCOMING,
          status: 'received',
          transcript: null,
          taskLinked: null,
        },
      });
      const admin = await prisma.coordinatorUser.findFirst({
        where: { companyId: resolvedCompanyId, role: CoordinatorRole.ADMIN },
        select: { id: true },
      });
      if (admin) {
        const task = await prisma.coordinatorTask.create({
          data: {
            title: 'مكالمة واردة',
            description: 'تم استلام مكالمة. أضف الملاحظات أو التغذية الراجعة بعد المتابعة.',
            status: CoordinatorTaskStatus.PENDING,
            companyId: resolvedCompanyId,
            createdById: admin.id,
            source: 'voice',
            coordinatorFeedback: `تم استلام المكالمة — ${new Date().toLocaleDateString('ar-IQ', { dateStyle: 'short' })}. بانتظار المتابعة وإضافة التغذية الراجعة.`,
          },
        });
        await prisma.coordinatorVoiceCallRecord.update({
          where: { id: callRecord.id },
          data: { taskLinked: task.id },
        });
      }
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ar-SA" voice="Polly.Zeina">مرحبا، تم استلام المكالمة. شكرا لكم.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  } catch (e) {
    console.error('POST /api/coordinator/voice/webhook/incoming:', e);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ar-SA">مرحبا.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallback, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
}

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
