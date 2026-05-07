type TwilioModule = typeof import('twilio');

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  return `+${trimmed.replace(/\D/g, '')}`;
}

export async function sendOtpSms(rawPhone: string, code: string): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE;
  if (!sid || !token || !from) return false;

  try {
    const twilioImport = (await import('twilio')) as TwilioModule;
    const client = twilioImport.default(sid, token);
    await client.messages.create({
      to: phone,
      from,
      body: `Your verification code is: ${code}`,
    });
    return true;
  } catch (error) {
    console.error('Twilio SMS failed:', error);
    return false;
  }
}
