import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setPhoneVerifiedCookie } from '@/lib/otp-auth';
import { checkOtp, normalizeCode } from '@/lib/otp-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const codeRaw = body.code != null ? String(body.code).trim() : '';
    const code = normalizeCode(codeRaw);
    if (!phone || !codeRaw) {
      return NextResponse.json(
        { success: false, message: 'Phone and code are required' },
        { status: 400 }
      );
    }

    const db = prisma as {
      phoneOtp?: {
        findFirst: (args: {
          where: { phone: string; code: string; expiresAt: { gt: Date } };
          orderBy: { createdAt: 'desc' };
        }) => Promise<{ id: string } | null>;
        deleteMany: (args: { where: { phone: string } }) => Promise<unknown>;
      };
    };

    let valid = false;
    if (process.env.NODE_ENV !== 'production') {
      valid = checkOtp(phone, code);
    }
    if (!valid && db.phoneOtp?.findFirst) {
      const record = await db.phoneOtp.findFirst({
        where: {
          phone,
          code: code,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      valid = !!record;
      if (valid && db.phoneOtp?.deleteMany) {
        await db.phoneOtp.deleteMany({ where: { phone } });
      }
    }

    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired code' },
        { status: 400 }
      );
    }

    await setPhoneVerifiedCookie(phone);

    return NextResponse.json({
      success: true,
      message: 'Phone verified',
    });
  } catch (e) {
    console.error('POST /api/otp/verify:', e);
    return NextResponse.json(
      { success: false, message: 'Verification failed' },
      { status: 500 }
    );
  }
}
