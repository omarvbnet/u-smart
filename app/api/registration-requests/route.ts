import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { notifyTicketsRegistrationRequest } from '@/lib/email';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';
import { getVerifiedEmailFromCookie } from '@/lib/otp-auth';

// Only COMPANY and PERSONAL can self-register. ENGINEER and TECHNICIAN are added by admin only.
const VALID_ROLES = ['COMPANY', 'PERSONAL'] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const legalName = typeof body.legalName === 'string' ? body.legalName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const evidenceUrl = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const roleRaw = typeof body.role === 'string' ? body.role.toUpperCase().trim() : '';
    if (roleRaw === 'ENGINEER' || roleRaw === 'TECHNICIAN' || roleRaw === 'WORKER') {
      return NextResponse.json(
        { success: false, message: 'Engineer, Technician, and Worker roles can only be assigned by admin. Please register as Company or Personal.' },
        { status: 400 }
      );
    }
    const role = VALID_ROLES.includes(roleRaw as (typeof VALID_ROLES)[number]) ? roleRaw : 'COMPANY';

    const evidenceRequired = role === 'COMPANY';
    if (!legalName || !phone || !email || !province || (evidenceRequired && !evidenceUrl)) {
      return NextResponse.json(
        { success: false, message: evidenceRequired ? 'Legal name, phone, email, province, and identification evidence are required' : 'Legal name, phone, email, and province are required' },
        { status: 400 }
      );
    }
    if (username && username.length < 4) {
      return NextResponse.json({ success: false, message: 'Username must be at least 4 characters' }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ success: false, message: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if ((username && !password) || (!username && password)) {
      return NextResponse.json(
        { success: false, message: 'Username and password must be provided together' },
        { status: 400 }
      );
    }

    const emailCheck = await checkEmailUnique(prisma, email);
    if (emailCheck.taken) {
      return NextResponse.json({ success: false, message: emailCheck.message ?? 'Email already in use' }, { status: 400 });
    }
    const phoneCheck = await checkPhoneUnique(prisma, phone);
    if (phoneCheck.taken) {
      return NextResponse.json({ success: false, message: phoneCheck.message ?? 'Phone number already in use' }, { status: 400 });
    }
    if (username) {
      const existingRequester = await prisma.ticketRequester.findUnique({
        where: { username },
        select: { id: true },
      });
      if (existingRequester) {
        return NextResponse.json({ success: false, message: 'Username already in use' }, { status: 400 });
      }
      const existingPending = await ((prisma as { registrationRequest?: { findFirst: (args: unknown) => Promise<unknown> } }).registrationRequest?.findFirst?.({
        where: { username, status: 'PENDING' },
        select: { id: true },
      }) ?? null);
      if (existingPending) {
        return NextResponse.json({ success: false, message: 'Username already requested in another pending registration' }, { status: 400 });
      }
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    // Company registrations should be routed to company_requests so they appear
    // in the admin "Company requests" page.
    if (role === 'COMPANY') {
      const verifiedEmail = await getVerifiedEmailFromCookie();
      if (!verifiedEmail || verifiedEmail !== email.trim().toLowerCase()) {
        return NextResponse.json(
          { success: false, message: 'Email verification required. Please verify your email first.' },
          { status: 400 }
        );
      }
      const companyDelegate = (prisma as { companyRequest?: { create: (args: unknown) => Promise<unknown> } }).companyRequest;
      if (!companyDelegate?.create) {
        return NextResponse.json(
          { success: false, message: 'Company requests not available' },
          { status: 503 }
        );
      }
      const created = await companyDelegate.create({
        data: {
          companyName: legalName,
          pocName: legalName,
          pocEmail: email.trim().toLowerCase(),
          pocPhone: phone,
          certificateUrl: evidenceUrl,
          serviceSlug: 'quality-control-supervision',
        },
      }) as { id: string };

      return NextResponse.json({
        success: true,
        requestId: created.id,
        message: 'Company registration submitted to admin company requests.',
      });
    }

    const delegate = (prisma as { registrationRequest?: { create: (args: unknown) => Promise<unknown> } }).registrationRequest;
    if (!delegate?.create) {
      return NextResponse.json(
        { success: false, message: 'Registration requests not available' },
        { status: 503 }
      );
    }

    const created = await delegate.create({
      data: {
        legalName,
        phone,
        email,
        province,
        evidenceUrl: evidenceRequired ? evidenceUrl : '',
        username: username || null,
        passwordHash,
        role,
      },
    }) as { id: string };

    notifyTicketsRegistrationRequest({
      id: created.id,
      legalName,
      phone,
      email,
      province,
      evidenceUrl,
      role,
    }).catch((e) => console.error('Tickets notification (registration):', e));

    return NextResponse.json({
      success: true,
      message: 'Registration request submitted. You will be notified once approved.',
    });
  } catch (err) {
    console.error('POST /api/registration-requests:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit registration request' },
      { status: 500 }
    );
  }
}
