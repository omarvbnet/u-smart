/**
 * Outbound OTP via Meta WhatsApp Cloud API (Graph).
 * Requires an approved Authentication (or Utility) template in Business Manager.
 *
 * Env:
 * - WHATSAPP_CLOUD_ACCESS_TOKEN — Graph API permanent / system-user token with whatsapp_business_messaging
 * - WHATSAPP_CLOUD_PHONE_NUMBER_ID — "Phone number ID" from WhatsApp → API Setup
 * - WHATSAPP_OTP_TEMPLATE_NAME — approved template name (e.g. otp_verify)
 * - WHATSAPP_OTP_TEMPLATE — optional shorthand; same as WHATSAPP_OTP_TEMPLATE_NAME
 * - WHATSAPP_OTP_TEMPLATE_LANGUAGE — optional, default en_US (must match template)
 * - WHATSAPP_CLOUD_GRAPH_VERSION — optional, default v22.0
 * - WHATSAPP_OTP_TEMPLATE_BODY_VARS — optional, "1" (default) or "2"; if "2", second body var = expiry minutes
 * - WHATSAPP_OTP_URL_BUTTON_INDEX — optional; if set ("0"|"1"), adds button/url component with OTP as suffix (matches copy-URL auth templates)
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

/** Meta expects WhatsApp IDs as digits only (country code included, no leading +). */
function toWhatsAppCloudRecipient(rawPhone: string): string {
  return rawPhone.replace(/\D/g, '');
}

export type SendOtpWhatsAppCloudArgs = {
  /** E.164 or local digits with country code; non-digits stripped */
  phone: string;
  code: string;
  /** Matches second {{2}} placeholder when WHATSAPP_OTP_TEMPLATE_BODY_VARS=2 */
  expiryMinutes?: number;
};

export async function sendOtpWhatsAppCloud({
  phone,
  code,
  expiryMinutes,
}: SendOtpWhatsAppCloudArgs): Promise<boolean> {
  const token = normalizeEnvValue(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN);
  const phoneNumberId = normalizeEnvValue(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
  const templateName = normalizeEnvValue(
    process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? process.env.WHATSAPP_OTP_TEMPLATE,
  );
  const language =
    normalizeEnvValue(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE) || 'en_US';
  const graphVersion =
    normalizeEnvValue(process.env.WHATSAPP_CLOUD_GRAPH_VERSION) || 'v22.0';
  const bodyVarsRaw = normalizeEnvValue(process.env.WHATSAPP_OTP_TEMPLATE_BODY_VARS) || '1';
  const bodyVarCount = bodyVarsRaw === '2' ? 2 : 1;
  const urlButtonIdx = normalizeEnvValue(process.env.WHATSAPP_OTP_URL_BUTTON_INDEX);

  const to = toWhatsAppCloudRecipient(phone);
  if (!token || !phoneNumberId || !templateName || !to) {
    const missing: string[] = [];
    if (!token) missing.push('WHATSAPP_CLOUD_ACCESS_TOKEN');
    if (!phoneNumberId) missing.push('WHATSAPP_CLOUD_PHONE_NUMBER_ID');
    if (!templateName) missing.push('WHATSAPP_OTP_TEMPLATE_NAME (or WHATSAPP_OTP_TEMPLATE)');
    if (!to) {
      missing.push(
        `recipient_phone (digits after normalize; got "${phone.replace(/\s/g, ' ')}" → empty — need country code, e.g. +964…)`,
      );
    }
    console.error(`WhatsApp Cloud OTP: incomplete config — missing or invalid:\n  - ${missing.join('\n  - ')}`);
    return false;
  }

  const bodyParameters: { type: 'text'; text: string }[] = [
    { type: 'text', text: code },
  ];
  if (bodyVarCount >= 2) {
    bodyParameters.push({
      type: 'text',
      text: String(expiryMinutes ?? '10'),
    });
  }

  const components: unknown[] = [
    {
      type: 'body',
      parameters: bodyParameters,
    },
  ];

  if (urlButtonIdx === '0' || urlButtonIdx === '1') {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: urlButtonIdx,
      parameters: [{ type: 'text', text: code }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };

  const url = `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(
    phoneNumberId
  )}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: unknown;
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (!res.ok || data?.error) {
      const code = data?.error?.code;
      const msg = data?.error?.message ?? JSON.stringify(data);
      console.error('WhatsApp Cloud OTP failed:', res.status, msg);
      if (code === 131030 || /allowed list/i.test(String(msg))) {
        console.error(
          'Hint (#131030): Add this recipient under Meta app → WhatsApp → API setup ' +
            '(test / allowed recipient numbers), or use a fully live app + approved messaging tier.'
        );
      }
      return false;
    }

    return true;
  } catch (e) {
    console.error('WhatsApp Cloud OTP request error:', e);
    return false;
  }
}
