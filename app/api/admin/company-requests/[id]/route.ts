import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCompanyAccountApprovedEmail } from '@/lib/email';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

function generateUsername(): string {
  return `company_${crypto.randomBytes(4).toString('hex')}`;
}

function generatePassword(): string {
  return crypto.randomBytes(8).toString('hex');
}

function slugifyCompanyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `company-${crypto.randomBytes(3).toString('hex')}`;
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
      const pocEmail = (companyRequest as { pocEmail?: string | null }).pocEmail;
      if (pocEmail) {
        const emailCheck = await checkEmailUnique(prisma, pocEmail, {
          companyRequestId: id,
        });
        const blockedByPendingRequestOnly =
          emailCheck.taken &&
          (emailCheck.message?.includes('pending registration') ||
            emailCheck.message?.includes('pending company request'));
        if (emailCheck.taken && !blockedByPendingRequestOnly) {
          return NextResponse.json({ success: false, message: emailCheck.message ?? 'Email already in use.' }, { status: 400 });
        }
      }
      const phoneCheck = await checkPhoneUnique(prisma, companyRequest.pocPhone, {
        companyRequestId: id,
      });
      const phoneBlockedByPendingRequestOnly =
        phoneCheck.taken &&
        (phoneCheck.message?.includes('pending registration') ||
          phoneCheck.message?.includes('pending company request'));
      if (phoneCheck.taken && !phoneBlockedByPendingRequestOnly) {
        return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone already in use.' }, { status: 400 });
      }

      if (!companyDelegate?.create) {
        return NextResponse.json({ success: false, message: 'Companies feature not available' }, { status: 503 });
      }
      const username = generateUsername();
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const serviceSlug = (companyRequest as { serviceSlug?: string }).serviceSlug === 'quality-control-supervision'
        ? 'quality-control-supervision'
        : 'enterprise-networking';

      // New identity source: CoordinatorCompany + CoordinatorUser (COMPANY_OWNER).
      const coordinatorSlugBase = slugifyCompanyName(companyRequest.companyName);
      let coordinatorSlug = coordinatorSlugBase;
      let slugAttempt = 0;
      while (slugAttempt < 5) {
        const existing = await (prisma as any).coordinatorCompany.findUnique({
          where: { slug: coordinatorSlug },
          select: { id: true },
        });
        if (!existing) break;
        slugAttempt += 1;
        coordinatorSlug = `${coordinatorSlugBase}-${crypto.randomBytes(2).toString('hex')}`;
      }
      let coordinatorCompany: { id: string };
      try {
        coordinatorCompany = await (prisma as any).coordinatorCompany.create({
          data: {
            name: companyRequest.companyName,
            slug: coordinatorSlug,
            freeTicketsLimit: 50,
            freeTicketsUsed: 0,
          },
        });
      } catch {
        coordinatorCompany = await (prisma as any).coordinatorCompany.create({
          data: {
            name: companyRequest.companyName,
            slug: coordinatorSlug,
          },
        });
      }
      try {
        await (prisma as any).coordinatorUser.create({
          data: {
            username,
            email: pocEmail && typeof pocEmail === 'string' ? pocEmail.trim().toLowerCase() : `${username}@example.local`,
            name: companyRequest.pocName,
            passwordHash,
            role: 'COMPANY_OWNER',
            status: 'ACTIVE',
            mustChangePassword: true,
            companyId: coordinatorCompany.id,
          },
        });
      } catch {
        await (prisma as any).coordinatorUser.create({
          data: {
            username,
            email: pocEmail && typeof pocEmail === 'string' ? pocEmail.trim().toLowerCase() : `${username}@example.local`,
            name: companyRequest.pocName,
            passwordHash,
            role: 'COORDINATOR',
            companyId: coordinatorCompany.id,
          },
        });
      }

      // Keep legacy requester/company records for compatibility with old admin pages.
      const requester = await prisma.ticketRequester.create({
        data: {
          username: `${username}_legacy`,
          passwordHash,
          name: companyRequest.pocName,
          email: null,
          phone: `99${Date.now().toString().slice(-9)}`,
          company: companyRequest.companyName,
          companyCertificationUrl: companyRequest.certificateUrl ?? undefined,
          serviceSlug,
          role: 'COMPANY',
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
