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

export async function sendOtpSms(
  rawPhone: string,
  code: string,
  channel: OtpChannel = 'sms'
): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;

  const sid = normalizeAccountSid(process.env.TWILIO_ACCOUNT_SID);
  const token = normalizeEnvValue(process.env.TWILIO_AUTH_TOKEN);
  const smsFrom = normalizePhone(normalizeEnvValue(process.env.TWILIO_PHONE));
  const whatsappFrom = toWhatsAppAddress(
    normalizeEnvValue(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_PHONE)
  );
  const from = channel === 'whatsapp' ? whatsappFrom : smsFrom;
  const to = channel === 'whatsapp' ? toWhatsAppAddress(phone) : phone;
  if (!sid || !token || !from) {
    console.error(
      'Twilio OTP config missing: TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE (and optional TWILIO_WHATSAPP_FROM)'
    );
    return false;
  }
  if (!/^AC[a-zA-Z0-9]{32}$/.test(sid)) {
    console.error('Twilio SMS config invalid: TWILIO_ACCOUNT_SID must start with AC and be 34 chars');
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
    console.error(`Twilio ${channel} OTP failed:`, error);
    return false;
  }
}
