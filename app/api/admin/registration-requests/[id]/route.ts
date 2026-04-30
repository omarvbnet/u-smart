import { NextRequest, NextResponse } from 'next/server';
import { RequesterRole } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCompanyAccountApprovedEmail } from '@/lib/email';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const withZero = a.startsWith('964') ? '0' + a.slice(3) : a;
  const with964 = a.startsWith('0') ? '964' + a.slice(1) : a;
  return b === withZero || b === with964;
}

function generateUsername(role: string): string {
  const prefixes: Record<string, string> = {
    ENGINEER: 'eng',
    TECHNICIAN: 'tech',
    WORKER: 'wrk',
    PERSONAL: 'per',
    COMPANY: 'req',
  };
  const prefix = prefixes[role] || 'req';
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function generatePassword(): string {
  return crypto.randomBytes(8).toString('hex');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing request id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';

    const delegate = (prisma as { registrationRequest?: { findUnique: (args: unknown) => Promise<unknown>; update: (args: unknown) => Promise<unknown> } }).registrationRequest;
    if (!delegate?.findUnique) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    const rr = await delegate.findUnique({ where: { id } }) as { id: string; legalName: string; phone: string; email: string; evidenceUrl: string; role: string; status: string } | null;
    if (!rr) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
    if (rr.status !== 'PENDING') {
      return NextResponse.json({ success: false, message: 'Request already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      await delegate.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    if (action === 'approve') {
      const normalizedEmail = rr.email.trim().toLowerCase();
      const normalizedPhone = normalizePhone(rr.phone);
      const existingRequesters = await prisma.ticketRequester.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          email: true,
          phone: true,
          serviceSlug: true,
        },
      });
      const existingRequester = existingRequesters.find((requester) => {
        const emailMatches = Boolean(
          requester.email && requester.email.trim().toLowerCase() === normalizedEmail
        );
        const phoneMatches = phonesMatch(normalizedPhone, normalizePhone(requester.phone));
        return emailMatches || phoneMatches;
      });

      // Allow upgrading Personal account to Company account instead of failing with 400.
      if (existingRequester && existingRequester.role === 'PERSONAL' && rr.role === 'COMPANY') {
        const upgradeServiceSlug = 'enterprise-networking';
        await prisma.ticketRequester.update({
          where: { id: existingRequester.id },
          data: {
            role: 'COMPANY',
            name: rr.legalName,
            email: rr.email,
            phone: rr.phone,
            companyCertificationUrl: rr.evidenceUrl,
            serviceSlug: upgradeServiceSlug,
            status: 'ACTIVE',
          },
        });
        await delegate.update({
          where: { id },
          data: { status: 'APPROVED' },
        });

        return NextResponse.json({
          success: true,
          status: 'APPROVED',
          upgraded: true,
          credentials: {
            username: existingRequester.username,
            password: null,
          },
          message: 'Existing personal account upgraded to company account successfully.',
        });
      }

      const emailCheck = await checkEmailUnique(prisma, rr.email, {
        registrationRequestId: rr.id,
      });
      const blockedByPendingRequestOnly =
        emailCheck.taken &&
        (emailCheck.message?.includes('pending registration') ||
          emailCheck.message?.includes('pending company request'));
      if (emailCheck.taken && !blockedByPendingRequestOnly) {
        return NextResponse.json({ success: false, message: emailCheck.message ?? 'Email already in use. Reject or ask user to use a different email.' }, { status: 400 });
      }
      const phoneCheck = await checkPhoneUnique(prisma, rr.phone, {
        registrationRequestId: rr.id,
      });
      const phoneBlockedByPendingRequestOnly =
        phoneCheck.taken &&
        (phoneCheck.message?.includes('pending registration') ||
          phoneCheck.message?.includes('pending company request'));
      if (phoneCheck.taken && !phoneBlockedByPendingRequestOnly) {
        return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone already in use. Reject or ask user to use a different phone.' }, { status: 400 });
      }

      const username = generateUsername(rr.role);
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);

      const serviceSlug = (rr.role === 'ENGINEER' || rr.role === 'TECHNICIAN' || rr.role === 'WORKER') ? 'quality-control-supervision' : 'enterprise-networking';
      const requesterRole: RequesterRole = ['COMPANY', 'ENGINEER', 'TECHNICIAN', 'PERSONAL', 'WORKER'].includes(rr.role) ? (rr.role as RequesterRole) : 'COMPANY';

      await prisma.ticketRequester.create({
        data: {
          username,
          passwordHash,
          name: rr.legalName,
          email: rr.email,
          phone: rr.phone,
          companyCertificationUrl: rr.evidenceUrl,
          serviceSlug,
          role: requesterRole,
        },
      });

      await delegate.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      sendCompanyAccountApprovedEmail(rr.email, {
        name: rr.legalName,
        username,
        password,
      }).catch((e) => console.error('Approval email failed:', e));

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        credentials: { username, password },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action. Use approve or reject.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/admin/registration-requests/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update request' }, { status: 500 });
  }
}
