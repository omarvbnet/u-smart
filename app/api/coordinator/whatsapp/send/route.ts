import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_WHATSAPP_FROM;

/**
 * POST: Send a WhatsApp message from the coordinator number (admin only).
 * Body: { to: string, body: string }. "to" must be E.164 (e.g. +9647712345678); we prefix with "whatsapp:" for Twilio.
 */
export async function POST(req: NextRequest) {
  try {
    requireCoordinatorRole(req, [CoordinatorRole.ADMIN]);
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    throw e;
  }

  if (!accountSid || !authToken || !from) {
    return NextResponse.json(
      { success: false, message: 'WhatsApp not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)' },
      { status: 503 }
    );
  }

  let body: { to?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const toRaw = typeof body.to === 'string' ? body.to.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!toRaw || !text) {
    return NextResponse.json({ success: false, message: 'to and body are required' }, { status: 400 });
  }

  const numPart = toRaw.replace(/^whatsapp:/i, '').trim();
  const withPlus = numPart.startsWith('+') ? numPart : `+${numPart}`;
  const to = `whatsapp:${withPlus}`;
  if (!/^whatsapp:\+[0-9]{10,15}$/.test(to)) {
    return NextResponse.json({ success: false, message: 'to must be a phone number in E.164 (e.g. +9647712345678)' }, { status: 400 });
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      from,
      to,
      body: text.slice(0, 4096),
    });
    return NextResponse.json({ success: true, sid: message.sid });
  } catch (e: unknown) {
    const twilioErr = e as { code?: number; message?: string };
    console.error('Twilio WhatsApp send:', twilioErr);
    return NextResponse.json(
      { success: false, message: twilioErr.message || 'Failed to send WhatsApp message' },
      { status: 500 }
    );
  }
}
