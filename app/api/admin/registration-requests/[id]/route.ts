import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RequesterRole, RequesterSpecialization } from '@prisma/client';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  sendCompanyAccountApprovedEmail,
  sendRequesterVerificationApprovedEmail,
  sendRequesterVerificationRejectedEmail,
} from '@/lib/email';
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

function generateUsernameFromEmail(email: string): string {
  const base = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || 'req';
  return `${base}_${crypto.randomBytes(2).toString('hex')}`;
}

function generatePassword(): string {
  return crypto.randomBytes(6).toString('hex');
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

    const rr = await delegate.findUnique({ where: { id } }) as {
      id: string;
      legalName: string;
      phone: string;
      email: string;
      province: string;
      evidenceUrl: string;
      role: string;
      status: string;
      requesterId?: string | null;
      username?: string | null;
      passwordHash?: string | null;
    } | null;
    if (!rr) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 });
    }
    if (rr.status !== 'PENDING') {
      return NextResponse.json({ success: false, message: 'Request already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ success: false, message: 'Rejection reason is required.' }, { status: 400 });
      }
      await delegate.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: reason },
      });
      sendRequesterVerificationRejectedEmail(rr.email, {
        name: rr.legalName,
        role: rr.role,
        reason,
      }).catch((e) => console.error('Rejection email failed:', e));
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    if (action === 'approve') {
      const requesterId = rr.requesterId?.trim() || null;

      if (requesterId && rr.role === 'COMPANY') {
        const linked = await prisma.ticketRequester.findUnique({
          where: { id: requesterId },
          select: {
            id: true,
            username: true,
            passwordHash: true,
            role: true,
            email: true,
            phone: true,
            name: true,
            province: true,
            company: true,
          },
        });
        if (!linked) {
          return NextResponse.json(
            { success: false, message: 'Linked requester account not found.' },
            { status: 400 }
          );
        }
        if (linked.role !== 'PERSONAL') {
          return NextResponse.json(
            { success: false, message: 'Linked account is not an individual (PERSONAL) user.' },
            { status: 400 }
          );
        }
        const companyName = rr.legalName.trim();
        await prisma.ticketRequester.update({
          where: { id: linked.id },
          data: {
            role: 'COMPANY',
            company: companyName,
            name: linked.name || companyName,
            email: rr.email.trim().toLowerCase() || linked.email,
            phone: rr.phone || linked.phone,
            province: rr.province?.trim() || linked.province,
            companyCertificationUrl: rr.evidenceUrl,
            serviceSlug: 'quality-control-supervision',
            status: 'ACTIVE',
          },
        });
        await delegate.update({
          where: { id },
          data: { status: 'APPROVED' },
        });
        const notifyEmail = (rr.email || linked.email || '').trim().toLowerCase();
        if (notifyEmail) {
          sendCompanyAccountApprovedEmail(notifyEmail, {
            name: linked.name || companyName,
            username: linked.username,
            password: '(use your existing phone sign-in)',
          }).catch((e) => console.error('Upgrade approval email failed:', e));
        }
        return NextResponse.json({
          success: true,
          status: 'APPROVED',
          upgraded: true,
          message: 'Individual account upgraded to company successfully.',
        });
      }

      const normalizedEmail = rr.email.trim().toLowerCase();
      const normalizedPhone = normalizePhone(rr.phone);
      const existingRequesters = await prisma.ticketRequester.findMany({
        select: {
          id: true,
          username: true,
          passwordHash: true,
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
        const upgradeServiceSlug = 'quality-control-supervision';
        let passwordForEmail = '(as submitted during registration)';
        let nextPasswordHash = rr.passwordHash || existingRequester.passwordHash;
        if (!nextPasswordHash) {
          const generatedPassword = generatePassword();
          nextPasswordHash = await bcrypt.hash(generatedPassword, 10);
          passwordForEmail = generatedPassword;
        }
        await prisma.ticketRequester.update({
          where: { id: existingRequester.id },
          data: {
            role: 'COMPANY',
            company: rr.legalName,
            name: existingRequester.name || rr.legalName,
            email: rr.email,
            phone: rr.phone,
            province: rr.province?.trim() || undefined,
            companyCertificationUrl: rr.evidenceUrl,
            serviceSlug: upgradeServiceSlug,
            status: 'ACTIVE',
            passwordHash: nextPasswordHash,
            hasUpdatedCredentials: false,
          },
        });
        await delegate.update({
          where: { id },
          data: { status: 'APPROVED' },
        });

        sendCompanyAccountApprovedEmail(rr.email, {
          name: rr.legalName,
          username: existingRequester.username,
          password: passwordForEmail,
        }).catch((e) => console.error('Approval email failed:', e));

        return NextResponse.json({
          success: true,
          status: 'APPROVED',
          upgraded: true,
          credentials: {
            username: existingRequester.username,
            password: passwordForEmail,
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

      let username = (rr.username || '').trim();
      let passwordHash = rr.passwordHash || '';
      let passwordForEmail = '(as submitted during registration)';
      if (!username) {
        username = generateUsernameFromEmail(rr.email);
      }
      if (!passwordHash) {
        const generatedPassword = generatePassword();
        passwordHash = await bcrypt.hash(generatedPassword, 10);
        passwordForEmail = generatedPassword;
      }
      const usernameTaken = await prisma.ticketRequester.findUnique({
        where: { username },
        select: { id: true },
      });
      if (usernameTaken) {
        return NextResponse.json(
          { success: false, message: 'Requested username is already in use. Ask user to submit another request with a different username.' },
          { status: 400 }
        );
      }

      const serviceSlug = 'quality-control-supervision';
      const requesterRole: RequesterRole = ['COMPANY', 'ENGINEER', 'TECHNICIAN', 'PERSONAL', 'WORKER'].includes(rr.role) ? (rr.role as RequesterRole) : 'COMPANY';
      const specializationRaw = (rr as { specialization?: string | null }).specialization ?? null;
      const validSpecializations: readonly RequesterSpecialization[] = [
        'ELECTRICAL',
        'MECHANICAL',
        'CIVIL',
        'TELECOM',
        'PROGRAMMER',
      ];
      const specialization: RequesterSpecialization | null =
        typeof specializationRaw === 'string' &&
        validSpecializations.includes(specializationRaw as RequesterSpecialization)
          ? (specializationRaw as RequesterSpecialization)
          : null;
      const requiresVerification = requesterRole === 'ENGINEER' || requesterRole === 'TECHNICIAN';

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
          specialization,
          verificationStatus: requiresVerification ? 'APPROVED' : 'PENDING',
          verifiedAt: requiresVerification ? new Date() : null,
        },
      });

      // Mirror coordinator company + user so the same username/password work for
      // coordinator-aware APIs (web + Provisor) as for legacy ticket_requester.
      const rrRoleUpper = String(rr.role).toUpperCase();
      if (rrRoleUpper === 'PERSONAL' || rrRoleUpper === 'COMPANY') {
        try {
          const emailNorm = rr.email.trim().toLowerCase();
          const slugBase = (rr.legalName || emailNorm.split('@')[0] || 'account')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || `acct-${crypto.randomBytes(3).toString('hex')}`;
          let coordinatorSlug = slugBase;
          for (let i = 0; i < 8; i++) {
            const existing = await (prisma as any).coordinatorCompany.findUnique({
              where: { slug: coordinatorSlug },
              select: { id: true },
            });
            if (!existing) break;
            coordinatorSlug = `${slugBase}-${crypto.randomBytes(2).toString('hex')}`;
          }
          let coordinatorCompany: { id: string };
          try {
            coordinatorCompany = await (prisma as any).coordinatorCompany.create({
              data: {
                name: rr.legalName,
                slug: coordinatorSlug,
                freeTicketsLimit: 50,
                freeTicketsUsed: 0,
              },
            });
          } catch {
            coordinatorCompany = await (prisma as any).coordinatorCompany.create({
              data: { name: rr.legalName, slug: coordinatorSlug },
            });
          }
          const coordRole = rrRoleUpper === 'COMPANY' ? 'COMPANY_OWNER' : 'CLIENT';
          try {
            await (prisma as any).coordinatorUser.create({
              data: {
                username,
                email: emailNorm,
                name: rr.legalName,
                passwordHash,
                role: coordRole,
                status: 'ACTIVE',
                mustChangePassword: false,
                companyId: coordinatorCompany.id,
              },
            });
          } catch {
            await (prisma as any).coordinatorUser.create({
              data: {
                username,
                email: emailNorm,
                name: rr.legalName,
                passwordHash,
                role: 'COORDINATOR',
                companyId: coordinatorCompany.id,
              },
            });
          }
        } catch (mirrorErr) {
          console.error(
            'Registration approve: coordinator mirror failed (legacy login still works):',
            mirrorErr
          );
        }
      }

      await delegate.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      sendCompanyAccountApprovedEmail(rr.email, {
        name: rr.legalName,
        username,
        password: passwordForEmail,
      }).catch((e) => console.error('Approval email failed:', e));
      if (requiresVerification) {
        sendRequesterVerificationApprovedEmail(rr.email, {
          name: rr.legalName,
          role: rr.role,
          specialization,
          username,
        }).catch((e) => console.error('Verification approved email failed:', e));
      }

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        credentials: { username, password: passwordForEmail },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action. Use approve or reject.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/admin/registration-requests/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update request' }, { status: 500 });
  }
}
