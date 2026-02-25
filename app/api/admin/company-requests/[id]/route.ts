import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCompanyAccountApprovedEmail } from '@/lib/email';

function generateUsername(): string {
  return `company_${crypto.randomBytes(4).toString('hex')}`;
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

    const crDelegate = (prisma as any).companyRequest;
    const companyDelegate = (prisma as any).company;
    if (!crDelegate?.findUnique) {
      return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
    }

    const companyRequest = await crDelegate.findUnique({
      where: { id },
    });
    if (!companyRequest) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
    if (companyRequest.status !== 'PENDING') {
      return NextResponse.json({ success: false, message: 'Request already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      await crDelegate.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    if (action === 'approve') {
      if (!companyDelegate?.create) {
        return NextResponse.json({ success: false, message: 'Companies feature not available' }, { status: 503 });
      }
      const username = generateUsername();
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const serviceSlug = (companyRequest as { serviceSlug?: string }).serviceSlug === 'quality-control-supervision'
        ? 'quality-control-supervision'
        : 'enterprise-networking';

      const pocEmail = (companyRequest as { pocEmail?: string | null }).pocEmail;
      const requester = await prisma.ticketRequester.create({
        data: {
          username,
          passwordHash,
          name: companyRequest.pocName,
          email: pocEmail && typeof pocEmail === 'string' ? pocEmail.trim() : undefined,
          phone: companyRequest.pocPhone,
          company: companyRequest.companyName,
          companyCertificationUrl: companyRequest.certificateUrl ?? undefined,
          serviceSlug,
        },
      });
      await companyDelegate.create({
        data: {
          companyName: companyRequest.companyName,
          pocName: companyRequest.pocName,
          pocPhone: companyRequest.pocPhone,
          certificateUrl: companyRequest.certificateUrl,
          serviceSlug,
          requesterId: requester.id,
        },
      });
      await crDelegate.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      const userEmail = pocEmail && typeof pocEmail === 'string' ? pocEmail.trim() : null;
      if (userEmail) {
        sendCompanyAccountApprovedEmail(userEmail, {
          name: companyRequest.pocName,
          username,
          password,
        }).catch((e) => console.error('Company account approved email:', e));
      }

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        credentials: { username, password },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action. Use approve or reject.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/admin/company-requests/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update request' }, { status: 500 });
  }
}
