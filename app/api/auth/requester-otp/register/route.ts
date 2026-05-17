import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RequesterRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkPhoneUnique } from '@/lib/check-unique-email-phone';
import { consumePhoneOtp } from '@/lib/consume-phone-otp';
import { normalizePhoneE164 } from '@/lib/phone-match';
import { nextResponseTicketRequesterSession } from '@/lib/provisor-otp-login-issue';

const SELF_REGISTER_ROLES: RequesterRole[] = [
  RequesterRole.COMPANY,
  RequesterRole.PERSONAL,
];

function parseRole(raw: unknown): RequesterRole | null {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!s) return RequesterRole.COMPANY;
  const match = SELF_REGISTER_ROLES.find((r) => r === s);
  return match ?? null;
}

async function generateUniqueUsername(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const suffix = crypto.randomBytes(5).toString('hex');
    const candidate = `u_${suffix}`;
    const exists = await prisma.ticketRequester.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `u_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Create an active Provisor (ticket_requester) account after phone OTP — no admin approval.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = body.code != null ? String(body.code).trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizePhoneE164(typeof body.phone === 'string' ? body.phone : '');
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
    const phonePlatform =
      typeof body.phonePlatform === 'string' ? body.phonePlatform.trim().toLowerCase() : '';

    let role = parseRole(body.role);
    if (role === null) {
      return NextResponse.json({ success: false, message: 'Invalid role for self-registration' }, { status: 400 });
    }

    if (!phone || !code) {
      return NextResponse.json(
        { success: false, message: 'Valid phone number and verification code are required' },
        { status: 400 }
      );
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: 'Phone number is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
    }
    if (!province) {
      return NextResponse.json({ success: false, message: 'Province is required' }, { status: 400 });
    }
    if (role === RequesterRole.COMPANY && !company) {
      return NextResponse.json(
        { success: false, message: 'Company name is required for company accounts' },
        { status: 400 }
      );
    }

    const validOtp = await consumePhoneOtp(phone, code);
    if (!validOtp) {
      return NextResponse.json({ success: false, message: 'Invalid or expired code' }, { status: 401 });
    }

    const phoneCheck = await checkPhoneUnique(prisma, phone);
    if (phoneCheck.taken) {
      return NextResponse.json(
        { success: false, message: phoneCheck.message ?? 'Phone number is already registered', code: 'PHONE_TAKEN' },
        { status: 409 }
      );
    }

    if (emailRaw) {
      const existingByEmail = await prisma.ticketRequester.findFirst({
        where: { email: { equals: emailRaw, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingByEmail) {
        return NextResponse.json(
          { success: false, message: 'An account with this email already exists. Sign in instead.', code: 'EMAIL_TAKEN' },
          { status: 409 }
        );
      }
    }

    let coordinatorCount = 0;
    if (emailRaw) {
      try {
        coordinatorCount = await (prisma as any).coordinatorUser.count({
          where: { email: { equals: emailRaw, mode: 'insensitive' } },
        });
      } catch {
        coordinatorCount = 0;
      }
    }
    if (emailRaw && coordinatorCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This contact is registered on the coordinator platform. Open the sign-in screen and use phone code — no separate sign-up.',
        },
        { status: 409 }
      );
    }

    const username = await generateUniqueUsername();
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const created = await prisma.ticketRequester.create({
      data: {
        username,
        passwordHash,
        // NULL, not '' — unique index allows many NULLs but only one empty string.
        email: emailRaw || null,
        name,
        phone,
        province: province || null,
        company: company || null,
        role,
        serviceSlug: 'quality-control-supervision',
        status: 'ACTIVE',
        hasUpdatedCredentials: true,
        mustChangePassword: false,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        province: true,
        provinceFilterActive: true,
        mustChangePassword: true,
      },
    });

    return nextResponseTicketRequesterSession(
      {
        ...created,
        role: created.role ?? 'COMPANY',
        status: 'ACTIVE',
      },
      pushToken,
      phonePlatform
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') {
      return NextResponse.json(
        {
          success: false,
          message: 'Could not complete registration — email may already be in use. Try signing in.',
        },
        { status: 409 }
      );
    }
    console.error('POST /api/auth/requester-otp/register:', err);
    return NextResponse.json({ success: false, message: 'Registration failed' }, { status: 500 });
  }
}
