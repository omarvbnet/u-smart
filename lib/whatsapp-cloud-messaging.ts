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
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Iraqi mobile: 07XXXXXXXXX → 9647XXXXXXXXX for wa.me
  if (digits.startsWith('07') && digits.length === 11) {
    digits = `964${digits.slice(1)}`;
  } else if (digits.startsWith('7') && digits.length === 10) {
    digits = `964${digits}`;
  } else if (digits.startsWith('00964')) {
    digits = digits.slice(2);
  }
  return digits;
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

  const links = buildWhatsAppDeepLinks({ phone: to, text });

  if (!isWhatsAppCloudConfigured()) {
    return {
      ok: true,
      message: `WhatsApp chat ready for the requester. Open this link on their phone to start the conversation: ${links.waMe}`,
      deepLink: links.waMe,
    };
  }

  const sent = await postMessages({
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
  return {
    ...sent,
    deepLink: links.waMe,
    message: sent.ok
      ? `WhatsApp message sent to ${to}. Confirm to the requester that the conversation started. Open link if needed: ${links.waMe}`
      : sent.message,
  };
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

  const links = buildWhatsAppDeepLinks({
    phone: to,
    text: args.caption || args.mediaUrl,
  });

  if (!isWhatsAppCloudConfigured()) {
    return {
      ok: true,
      message: `WhatsApp file share ready. Open on the requester’s phone: ${links.waMe}`,
      deepLink: links.waMe,
    };
  }

  const media: Record<string, unknown> = { link: args.mediaUrl };
  if (args.caption) media.caption = args.caption.slice(0, 1000);
  if (args.kind === 'document' && args.filename) media.filename = args.filename;

  const sent = await postMessages({
    to,
    type: args.kind,
    [args.kind]: media,
  });
  return {
    ...sent,
    deepLink: links.waMe,
    message: sent.ok
      ? `WhatsApp file sent to ${to}. Tell the requester it was shared. Link: ${links.waMe}`
      : sent.message,
  };
}

export function prepareWhatsAppCall(args: { to: string; note?: string }): WhatsAppSendResult {
  const to = toWhatsAppDigits(args.to);
  if (!to || to.length < 8) return { ok: false, message: 'Invalid recipient phone' };
  const briefing =
    (args.note || '').trim() ||
    'مرحباً — اتصال من U Agent / Proviser. يرجى الرد أو قراءة الرسالة.';
  const links = buildWhatsAppDeepLinks({
    phone: to,
    text: briefing.slice(0, 1000),
  });
  return {
    ok: true,
    message: `WhatsApp call/chat ready for +${to}. Briefing is prefilled. Tell the requester: WhatsApp will open — tap Call, or send the prefilled message. Feedback: opened for ${to}.`,
    // Prefer native scheme so the phone opens WhatsApp app directly
    deepLink: links.chatLink,
    callLink: links.waMe,
  };
}
