/**
 * WhatsApp Cloud API helpers for U Agent outbound actions.
 * Uses the same env as OTP (WHATSAPP_CLOUD_ACCESS_TOKEN + PHONE_NUMBER_ID).
 */

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

export function toWhatsAppDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(
    normalizeEnvValue(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN) &&
      normalizeEnvValue(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID)
  );
}

function graphBase(): { token: string; phoneNumberId: string; version: string } | null {
  const token = normalizeEnvValue(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN);
  const phoneNumberId = normalizeEnvValue(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
  if (!token || !phoneNumberId) return null;
  const version = normalizeEnvValue(process.env.WHATSAPP_CLOUD_GRAPH_VERSION) || 'v22.0';
  return { token, phoneNumberId, version };
}

export type WhatsAppSendResult = {
  ok: boolean;
  message: string;
  messageId?: string;
  deepLink?: string;
  callLink?: string;
};

/** Deep links that open the user's WhatsApp app (personal) after they grant permission. */
export function buildWhatsAppDeepLinks(args: {
  phone: string;
  text?: string;
}): { chatLink: string; callHint: string; waMe: string } {
  const digits = toWhatsAppDigits(args.phone);
  const text = args.text ? encodeURIComponent(args.text.slice(0, 1000)) : '';
  const waMe = text
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/${digits}`;
  const chatLink = text
    ? `whatsapp://send?phone=${digits}&text=${text}`
    : `whatsapp://send?phone=${digits}`;
  // WhatsApp has no universal “start call” URL; open chat so the user can tap Call.
  const callHint = waMe;
  return { chatLink, callHint, waMe };
}

async function postMessages(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const cfg = graphBase();
  if (!cfg) {
    return {
      ok: false,
      message:
        'WhatsApp Cloud API is not configured (WHATSAPP_CLOUD_ACCESS_TOKEN / WHATSAPP_CLOUD_PHONE_NUMBER_ID).',
    };
  }
  const url = `https://graph.facebook.com/${encodeURIComponent(cfg.version)}/${encodeURIComponent(
    cfg.phoneNumberId
  )}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return {
        ok: false,
        message: json.error?.message || `WhatsApp API error (${res.status})`,
      };
    }
    return {
      ok: true,
      message: 'WhatsApp message sent',
      messageId: json.messages?.[0]?.id,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'WhatsApp send failed',
    };
  }
}

export async function sendWhatsAppText(args: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const to = toWhatsAppDigits(args.to);
  if (!to || to.length < 8) return { ok: false, message: 'Invalid recipient phone' };
  const text = args.body.trim().slice(0, 4000);
  if (!text) return { ok: false, message: 'Message body required' };

  if (!isWhatsAppCloudConfigured()) {
    const links = buildWhatsAppDeepLinks({ phone: to, text });
    return {
      ok: true,
      message:
        'Cloud API not configured — open the deep link on the user’s phone to send from their WhatsApp.',
      deepLink: links.waMe,
    };
  }

  return postMessages({
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

export async function sendWhatsAppMedia(args: {
  to: string;
  mediaUrl: string;
  kind: 'image' | 'document' | 'audio' | 'video';
  filename?: string;
  caption?: string;
}): Promise<WhatsAppSendResult> {
  const to = toWhatsAppDigits(args.to);
  if (!to || to.length < 8) return { ok: false, message: 'Invalid recipient phone' };
  if (!args.mediaUrl?.startsWith('http')) {
    return { ok: false, message: 'mediaUrl must be a public https URL' };
  }

  if (!isWhatsAppCloudConfigured()) {
    const links = buildWhatsAppDeepLinks({
      phone: to,
      text: args.caption || args.mediaUrl,
    });
    return {
      ok: true,
      message: 'Cloud API not configured — use deep link to share from personal WhatsApp.',
      deepLink: links.waMe,
    };
  }

  const media: Record<string, unknown> = { link: args.mediaUrl };
  if (args.caption) media.caption = args.caption.slice(0, 1000);
  if (args.kind === 'document' && args.filename) media.filename = args.filename;

  return postMessages({
    to,
    type: args.kind,
    [args.kind]: media,
  });
}

export function prepareWhatsAppCall(args: { to: string; note?: string }): WhatsAppSendResult {
  const to = toWhatsAppDigits(args.to);
  if (!to || to.length < 8) return { ok: false, message: 'Invalid recipient phone' };
  const links = buildWhatsAppDeepLinks({
    phone: to,
    text: args.note || 'U Agent: please answer this WhatsApp call / chat.',
  });
  return {
    ok: true,
    message:
      'WhatsApp call ready. Open the link on the user’s device to start a WhatsApp voice/video call from their account.',
    deepLink: links.waMe,
    callLink: links.callHint,
  };
}
