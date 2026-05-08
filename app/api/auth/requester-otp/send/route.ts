import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setOtp } from '@/lib/otp-store';
import { sendOtpSms } from '@/lib/sms';

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

    const sent = await sendOtpSms(phone, code, 'whatsapp');
    if (!sent && !isDev) {
      return NextResponse.json(
        { success: false, message: 'Failed to send verification code on WhatsApp. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your WhatsApp',
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
