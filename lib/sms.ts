type TwilioModule = typeof import('twilio');
type OtpChannel = 'sms' | 'whatsapp';

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

function normalizeAccountSid(raw: string | undefined): string {
  const value = normalizeEnvValue(raw);
  const directMatch = value.match(/^AC[a-zA-Z0-9]{32}$/);
  if (directMatch) return directMatch[0];

  // Recover from accidentally pasted prefixes/suffixes in env values.
  const embeddedMatch = value.match(/AC[a-zA-Z0-9]{32}/);
  return embeddedMatch ? embeddedMatch[0] : value;
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return `+${trimmed.replace(/\D/g, '')}`;
}

function toWhatsAppAddress(rawPhone: string): string {
  const phone = normalizePhone(rawPhone);
  return phone ? `whatsapp:${phone}` : '';
}

/** Twilio's well-known WhatsApp Sandbox number — only usable with the whatsapp: scheme. */
const TWILIO_WHATSAPP_SANDBOX = '+14155238886';

export async function sendOtpSms(
  rawPhone: string,
  code: string,
  channel: OtpChannel = 'sms'
): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;

  const sid = normalizeAccountSid(process.env.TWILIO_ACCOUNT_SID);
  const token = normalizeEnvValue(process.env.TWILIO_AUTH_TOKEN);

  // SMS sender: prefer TWILIO_SMS_FROM, fall back to TWILIO_PHONE.
  // (TWILIO_PHONE may legitimately be the WhatsApp Sandbox number, which is NOT SMS-capable.)
  const smsFrom = normalizePhone(
    normalizeEnvValue(process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE)
  );

  // WhatsApp sender: prefer TWILIO_WHATSAPP_FROM, fall back to TWILIO_PHONE.
  const whatsappFrom = toWhatsAppAddress(
    normalizeEnvValue(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_PHONE)
  );

  const from = channel === 'whatsapp' ? whatsappFrom : smsFrom;
  const to = channel === 'whatsapp' ? toWhatsAppAddress(phone) : phone;
  if (!sid || !token || !from) {
    console.error(
      `Twilio OTP config missing for channel=${channel}: ` +
        `need TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN and ` +
        (channel === 'whatsapp'
          ? 'TWILIO_WHATSAPP_FROM (or TWILIO_PHONE).'
          : 'TWILIO_SMS_FROM (or a SMS-capable TWILIO_PHONE).')
    );
    return false;
  }
  if (!/^AC[a-zA-Z0-9]{32}$/.test(sid)) {
    console.error('Twilio config invalid: TWILIO_ACCOUNT_SID must start with AC and be 34 chars');
    return false;
  }
  if (channel === 'sms' && smsFrom === TWILIO_WHATSAPP_SANDBOX) {
    console.error(
      `Twilio SMS misconfiguration: the configured "From" (${smsFrom}) is Twilio's WhatsApp Sandbox number, ` +
        `which cannot send SMS. Set TWILIO_SMS_FROM to an SMS-enabled Twilio number ` +
        `(buy one in Console → Phone Numbers → Buy a number, or use a verified outbound number).`
    );
    return false;
  }

  try {
    const twilioFactory = (await import('twilio')) as unknown as TwilioModule;
    const client = twilioFactory(sid, token);
    await client.messages.create({
      to,
      from,
      body: `Your verification code is: ${code}. Valid for 10 minutes.`,
    });
    return true;
  } catch (error) {
    // Surface a friendlier hint for the very common "WhatsApp number used as SMS sender" mismatch.
    const e = error as { code?: number; status?: number; message?: string };
    if (channel === 'sms' && e?.code === 21660) {
      console.error(
        `Twilio SMS error 21660: From=${from} is not an SMS-capable number on your account. ` +
          `Either configure TWILIO_SMS_FROM with a real Twilio SMS number, or call sendOtpSms(..., 'whatsapp') instead.`
      );
    } else {
      console.error(`Twilio ${channel} OTP failed:`, error);
    }
    return false;
  }
}
