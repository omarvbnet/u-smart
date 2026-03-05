import { NextRequest, NextResponse } from 'next/server';
import { RequesterRole } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCompanyAccountApprovedEmail } from '@/lib/email';

function generateUsername(role: string): string {
  const prefixes: Record<string, string> = {
    ENGINEER: 'eng',
    TECHNICIAN: 'tech',
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
      const username = generateUsername(rr.role);
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);

      const serviceSlug = (rr.role === 'ENGINEER' || rr.role === 'TECHNICIAN') ? 'quality-control-supervision' : 'enterprise-networking';
      const requesterRole: RequesterRole = ['COMPANY', 'ENGINEER', 'TECHNICIAN', 'PERSONAL'].includes(rr.role) ? (rr.role as RequesterRole) : 'COMPANY';

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
