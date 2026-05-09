import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setOtp } from '@/lib/otp-store';
import { sendOtpSms } from '@/lib/sms';
import { sendOtpWhatsAppCloud } from '@/lib/whatsapp-cloud-otp';

const OTP_EXPIRY_MINUTES = 10;
const CODE_LENGTH = 6;

/** Default when JSON body omits `channel`: `sms` → Twilio; `whatsapp` → Meta Cloud API (`lib/whatsapp-cloud-otp.ts`) */
function requesterOtpChannelFromEnv(): 'sms' | 'whatsapp' {
  const raw = (process.env.REQUESTER_OTP_CHANNEL ?? 'sms').toLowerCase().trim();
  return raw === 'whatsapp' ? 'whatsapp' : 'sms';
}

/** Provisor app may send `{ channel: "whatsapp" | "sms" }` — wins over env default. */
function parsePreferredChannel(raw: unknown): 'sms' | 'whatsapp' | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.toLowerCase().trim();
  if (v === 'sms') return 'sms';
  if (v === 'whatsapp') return 'whatsapp';
  return undefined;
}

function resolveRequesterOtpChannel(body: Record<string, unknown>): 'sms' | 'whatsapp' {
  const preferred =
    parsePreferredChannel(body.channel) ?? parsePreferredChannel(body.deliveryChannel);
  return preferred ?? requesterOtpChannelFromEnv();
}

function generateCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!phone || phone.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Valid phone number is required' },
        { status: 400 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    try {
      const db = prisma as unknown as {
        phoneOtp?: { create: (args: { data: { phone: string; code: string; expiresAt: Date } }) => Promise<unknown> };
      };
      if (db.phoneOtp?.create) {
        await db.phoneOtp.create({
          data: { phone, code, expiresAt },
        });
      }
    } catch (dbErr) {
      console.error('Phone OTP save (requester-otp):', dbErr);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) setOtp(phone, code);

    const channel = resolveRequesterOtpChannel(body);
    const sent =
      channel === 'whatsapp'
        ? await sendOtpWhatsAppCloud({
            phone,
            code,
            expiryMinutes: OTP_EXPIRY_MINUTES,
          })
        : await sendOtpSms(phone, code, 'sms');
    if (!sent && !isDev) {
      const via = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
      return NextResponse.json(
        {
          success: false,
          otpChannel: channel,
          message: `Failed to send verification code by ${via}. Please try again.`,
        },
        { status: 500 }
      );
    }

    const deliveryLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
    return NextResponse.json({
      success: true,
      otpChannel: channel,
      message: `Verification code sent by ${deliveryLabel}`,
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/auth/requester-otp/send:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send verification code' },
      { status: 500 }
    );
  }
}
