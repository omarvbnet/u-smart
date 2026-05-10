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
 * - WHATSAPP_OTP_TEMPLATE_BODY_VARS — optional, "0" | "1" (default) | "2" (OTP + expiry for {{2}})
 * - WHATSAPP_OTP_URL_BUTTON_INDEX — explicit "0" | "1" for dynamic URL suffix (OTP) on the template button
 * - WHATSAPP_OTP_BUTTON_MODE — optional:
 *     - unset / "utility": add URL button only if WHATSAPP_OTP_URL_BUTTON_INDEX is "0"|"1" (backward compatible).
 *     - "auth"|"authentication"|"copy_code": always send Meta auth-style URL button + body (fixes #131008 on copy-code auth templates).
 *     - "none": never add a button component (body-only Utility templates).
 * - WHATSAPP_OTP_USE_COUPON_CODE_BUTTON — set "true" to send `sub_type: COPY_CODE` + `coupon_code` param (some API versions).
 *
 * Error #132000 = parameter **count** mismatch vs approved template (adjust body vars + button mode).
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
  const bodyVarCount: 0 | 1 | 2 =
    bodyVarsRaw === '0' ? 0 : bodyVarsRaw === '2' ? 2 : 1;

  const buttonMode = normalizeEnvValue(process.env.WHATSAPP_OTP_BUTTON_MODE).toLowerCase();
  const explicitButtonIdx = normalizeEnvValue(process.env.WHATSAPP_OTP_URL_BUTTON_INDEX);
  const useCouponCodeStyle =
    normalizeEnvValue(process.env.WHATSAPP_OTP_USE_COUPON_CODE_BUTTON).toLowerCase() === 'true';

  /** Meta Authentication “copy code” sends must include URL button idx 0 with same OTP — see Meta auth OTP docs. */
  let urlButtonIdx: '0' | '1' | null = null;
  const authModes = new Set(['auth', 'authentication', 'copy_code', 'otp']);
  if (buttonMode === 'none' || buttonMode === 'utility' || buttonMode === '') {
    if (explicitButtonIdx === '0' || explicitButtonIdx === '1') urlButtonIdx = explicitButtonIdx;
  } else if (authModes.has(buttonMode)) {
    urlButtonIdx = explicitButtonIdx === '1' ? '1' : '0';
  }
  if (useCouponCodeStyle) {
    urlButtonIdx = explicitButtonIdx === '1' ? '1' : '0';
  }

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

  const bodyParameters: { type: 'text'; text: string }[] = [];
  if (bodyVarCount >= 1) {
    bodyParameters.push({ type: 'text', text: code });
  }
  if (bodyVarCount >= 2) {
    bodyParameters.push({
      type: 'text',
      text: String(expiryMinutes ?? '10'),
    });
  }

  const components: unknown[] = [];
  if (bodyVarCount >= 1) {
    components.push({
      type: 'body',
      parameters: bodyParameters,
    });
  }

  if (urlButtonIdx === '0' || urlButtonIdx === '1') {
    if (useCouponCodeStyle) {
      components.push({
        type: 'button',
        sub_type: 'COPY_CODE',
        index: urlButtonIdx,
        parameters: [{ type: 'coupon_code', coupon_code: code }],
      });
    } else {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: urlButtonIdx,
        parameters: [{ type: 'text', text: code }],
      });
    }
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

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    const err = data?.error as
      | { message?: string; code?: number; error_subcode?: number; error_data?: unknown }
      | undefined;

    if (!res.ok || err) {
      const code = err?.code;
      const msg = err?.message ?? JSON.stringify(data);
      console.error('WhatsApp Cloud OTP failed:', res.status, msg);
      const logFull = process.env.NODE_ENV !== 'production' || code === 131008 || code === 132000;
      if (logFull) {
        console.error('WhatsApp Cloud OTP Graph response:', JSON.stringify(data));
      }
      if (code === 131030 || /allowed list/i.test(String(msg))) {
        console.error(
          'Hint (#131030): Add this recipient under Meta app → WhatsApp → API setup ' +
            '(test / allowed recipient numbers), or use a fully live app + approved messaging tier.'
        );
      }
      if (
        code === 131008 ||
        /parameter is missing|requires a parameter|131008/i.test(String(msg))
      ) {
        console.error(
          'Hint (#131008): Match template components — e.g. Authentication + Copy code needs BOTH body OTP ' +
            'and URL button suffix: set WHATSAPP_OTP_BUTTON_MODE=auth (or WHATSAPP_OTP_URL_BUTTON_INDEX=0). ' +
            'Utility templates with only {{1}} in the body must use WHATSAPP_OTP_BUTTON_MODE=none ' +
            'and fix WHATSAPP_OTP_TEMPLATE_BODY_VARS (use 2 if template has OTP + expiry).'
        );
      }
      if (code === 132000 || /132000|does not match the expected number/i.test(String(msg))) {
        console.error(
          'Hint (#132000): In WhatsApp Manager, open this template and count body {{n}} placeholders and buttons. ' +
            'Set WHATSAPP_OTP_TEMPLATE_BODY_VARS to the number of body variables (0/1/2) — e.g. only {{1}} ⇒ 1; {{1}}{{2}} ⇒ 2. ' +
            'If template has NO dynamic URL/copy button, use WHATSAPP_OTP_BUTTON_MODE=none. If it HAS copy-code/URL suffix, use auth mode or WHATSAPP_OTP_URL_BUTTON_INDEX=0. ' +
            'Arabic vs English is a separate template: WHATSAPP_OTP_TEMPLATE_LANGUAGE must match the approved language code exactly.'
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
