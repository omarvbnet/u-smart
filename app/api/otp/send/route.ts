import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setOtp } from '@/lib/otp-store';

const OTP_EXPIRY_MINUTES = 10;
const CODE_LENGTH = 6;

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
    const body = await req.json();
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
      const db = prisma as unknown as { phoneOtp?: { create: (args: { data: { phone: string; code: string; expiresAt: Date } }) => Promise<unknown> } };
      if (db.phoneOtp?.create) {
        await db.phoneOtp.create({
          data: { phone, code, expiresAt },
        });
      }
    } catch (dbErr) {
      console.error('OTP save:', dbErr);
    }

    // In production: send SMS via Twilio/etc. using env TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      setOtp(phone, code);
      console.log('[OTP] Phone:', phone, 'Code:', code);
    }
    // PRODUCTION: To send the code to the user's physical phone, integrate an SMS provider here.
    // Example: Twilio — set env TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE and call:
    //   await twilioClient.messages.create({ to: phone, from: process.env.TWILIO_PHONE, body: `Your code: ${code}` });
    // Without this, the code is only in the response (devCode) or server log — it is NOT sent to the device.

    return NextResponse.json({
      success: true,
      message: 'OTP sent',
      ...(isDev && { devCode: code }),
    });
  } catch (e) {
    console.error('POST /api/otp/send:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
