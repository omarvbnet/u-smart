import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

function normalizeEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Meta sends: X-Hub-Signature-256: sha256=<hex>
 * See https://developers.facebook.com/docs/graph-api/webhooks/getting-started/#validate-payloads
 */
function verifyMetaSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader || !/^sha256=[a-fA-F0-9]{64}$/.test(signatureHeader)) {
    return false;
  }
  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expected = `sha256=${expectedHex}`;
  return timingSafeCompare(signatureHeader, expected);
}

/**
 * GET — Meta webhook subscription verification.
 * Set **Callback URL** in the app dashboard to:
 *   `https://<your-domain>/api/webhooks/whatsapp`
 * Set **Verify token** to the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your env.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const expected = normalizeEnvValue(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  if (!expected) {
    console.error('WhatsApp webhook: WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set');
    return new NextResponse('Verification not configured', { status: 503 });
  }

  if (mode === 'subscribe' && token && challenge && timingSafeCompare(token, expected)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — Incoming webhooks (messages, message_status, etc.).
 * If `WHATSAPP_CLOUD_APP_SECRET` is set, `X-Hub-Signature-256` is validated.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const appSecret = normalizeEnvValue(process.env.WHATSAPP_CLOUD_APP_SECRET);

  if (appSecret) {
    const sig = req.headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(appSecret, rawBody, sig)) {
      return new NextResponse('Invalid signature', { status: 403 });
    }
  }

  try {
    const payload = rawBody ? JSON.parse(rawBody) : {};
    // Hook for future handling (store in DB, queue, etc.)
    if (process.env.NODE_ENV !== 'production') {
      console.log('WhatsApp webhook POST:', JSON.stringify(payload).slice(0, 2000));
    }
  } catch {
    // Still 200 so Meta does not disable the webhook on parse errors
  }

  return NextResponse.json({ success: true });
}
