import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinatorAuth } from '@/lib/coordinator/rbac';

/**
 * GET: Return the coordinator's WhatsApp number for display (e.g. "Contact coordinator on WhatsApp").
 * Requires coordinator session. Number comes from TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886);
 * we strip the "whatsapp:" prefix for display and wa.me links.
 */
export async function GET(req: NextRequest) {
  try {
    requireCoordinatorAuth(req);
  } catch {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from || typeof from !== 'string') {
    return NextResponse.json({ success: true, number: null, message: 'WhatsApp not configured' });
  }
  const number = from.replace(/^whatsapp:/i, '').trim();
  return NextResponse.json({ success: true, number: number || from });
}
