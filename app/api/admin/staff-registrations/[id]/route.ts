import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RequesterRole, RequesterSpecialization } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  sendProviserStaffApprovedEmail,
  sendRequesterVerificationRejectedEmail,
} from '@/lib/email';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

function generateUsernameFromEmail(email: string): string {
  const base = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'staff';
  return `${base}_${crypto.randomBytes(2).toString('hex')}`;
}

function generatePassword(): string {
  return crypto.randomBytes(6).toString('hex');
}

type StaffRequest = {
  id: string;
  legalName: string;
  email: string;
  phone: string;
  province: string;
  role: string;
  specialization: string | null;
  idDocumentUrl: string;
  status: string;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Missing request id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';

    const delegate = (
      prisma as {
        staffRegistrationRequest?: {
          findUnique: (args: unknown) => Promise<StaffRequest | null>;
          update: (args: unknown) => Promise<unknown>;
        };
      }
    ).staffRegistrationRequest;
    if (!delegate?.findUnique) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    const sr = await delegate.findUnique({ where: { id } });
    if (!sr) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
    if (sr.status !== 'PENDING') {
      return NextResponse.json({ success: false, message: 'Request already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ success: false, message: 'Rejection reason is required.' }, { status: 400 });
      }
      await delegate.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: reason, reviewedAt: new Date() },
      });
      sendRequesterVerificationRejectedEmail(sr.email, {
        name: sr.legalName,
        role: sr.role,
        reason,
      }).catch((e) => console.error('Staff rejection email failed:', e));
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    if (action === 'approve') {
      const emailCheck = await checkEmailUnique(prisma, sr.email);
      if (emailCheck.taken) {
        return NextResponse.json(
          { success: false, message: emailCheck.message ?? 'Email already in use. Reject this request.' },
          { status: 400 }
        );
      }
      const phoneCheck = await checkPhoneUnique(prisma, sr.phone);
      if (phoneCheck.taken) {
        return NextResponse.json(
          { success: false, message: phoneCheck.message ?? 'Phone already in use. Reject this request.' },
          { status: 400 }
        );
      }

      let username = generateUsernameFromEmail(sr.email);
      for (let i = 0; i < 8; i++) {
        const exists = await prisma.ticketRequester.findUnique({
          where: { username },
          select: { id: true },
        });
        if (!exists) break;
        username = generateUsernameFromEmail(sr.email);
      }
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);

      const requesterRole: RequesterRole = sr.role === 'TECHNICIAN' ? 'TECHNICIAN' : 'ENGINEER';
      const validSpecializations: readonly RequesterSpecialization[] = [
        'ELECTRICAL',
        'MECHANICAL',
        'CIVIL',
        'TELECOM',
        'PROGRAMMER',
      ];
      const specialization: RequesterSpecialization | null =
        sr.specialization && validSpecializations.includes(sr.specialization as RequesterSpecialization)
          ? (sr.specialization as RequesterSpecialization)
          : null;

      await prisma.ticketRequester.create({
        data: {
          username,
          passwordHash,
          name: sr.legalName,
          email: sr.email,
          phone: sr.phone,
          province: sr.province,
          companyCertificationUrl: sr.idDocumentUrl,
          serviceSlug: 'quality-control-supervision',
          role: requesterRole,
          specialization,
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      });

      await delegate.update({
        where: { id },
        data: { status: 'APPROVED', username, passwordHash, reviewedAt: new Date() },
      });

      sendProviserStaffApprovedEmail({
        to: sr.email,
        recipientName: sr.legalName,
        role: requesterRole,
        specialization,
        username,
        temporaryPassword: password,
      }).catch((e) => console.error('Staff approval email failed:', e));

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        credentials: { username, password },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action. Use approve or reject.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/admin/staff-registrations/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update request' }, { status: 500 });
  }
}
