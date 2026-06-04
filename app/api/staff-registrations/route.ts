import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyTicketsStaffRegistration } from '@/lib/email';
import { checkEmailUnique, checkPhoneUnique } from '@/lib/check-unique-email-phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ROLES = ['ENGINEER', 'TECHNICIAN'] as const;
const VALID_SPECIALIZATIONS = ['ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER'] as const;

type StaffRegistrationDelegate = {
  create: (args: unknown) => Promise<{ id: string }>;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const legalName = asString(body.legalName);
    const dateOfBirthRaw = asString(body.dateOfBirth);
    const email = asString(body.email).toLowerCase();
    const phone = asString(body.phone);
    const province = asString(body.province);
    const idDocumentUrl = asString(body.idDocumentUrl);
    const roleRaw = asString(body.role).toUpperCase();
    const role = VALID_ROLES.includes(roleRaw as (typeof VALID_ROLES)[number]) ? roleRaw : '';
    const specializationRaw = asString(body.specialization).toUpperCase();
    const specialization = VALID_SPECIALIZATIONS.includes(
      specializationRaw as (typeof VALID_SPECIALIZATIONS)[number]
    )
      ? specializationRaw
      : null;
    const certificateUrls = Array.isArray(body.certificateUrls)
      ? (body.certificateUrls as unknown[])
          .map((u) => asString(u))
          .filter((u) => u.length > 0)
          .slice(0, 10)
      : [];

    if (!legalName || !dateOfBirthRaw || !email || !phone || !province || !idDocumentUrl || !role) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Legal name, date of birth, education, email, phone, province and an ID document are required.',
        },
        { status: 400 }
      );
    }

    const dateOfBirth = new Date(dateOfBirthRaw);
    if (Number.isNaN(dateOfBirth.getTime())) {
      return NextResponse.json({ success: false, message: 'Invalid date of birth.' }, { status: 400 });
    }
    const now = new Date();
    const age = (now.getTime() - dateOfBirth.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 16 || age > 100) {
      return NextResponse.json(
        { success: false, message: 'Please provide a valid date of birth.' },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, message: 'Invalid email address.' }, { status: 400 });
    }

    const emailCheck = await checkEmailUnique(prisma, email);
    if (emailCheck.taken) {
      return NextResponse.json(
        { success: false, message: emailCheck.message ?? 'Email already in use' },
        { status: 400 }
      );
    }
    const phoneCheck = await checkPhoneUnique(prisma, phone);
    if (phoneCheck.taken) {
      return NextResponse.json(
        { success: false, message: phoneCheck.message ?? 'Phone number already in use' },
        { status: 400 }
      );
    }

    const delegate = (prisma as { staffRegistrationRequest?: StaffRegistrationDelegate })
      .staffRegistrationRequest;
    if (!delegate?.create) {
      return NextResponse.json(
        { success: false, message: 'Staff registration is not available right now.' },
        { status: 503 }
      );
    }

    // Guard against duplicate pending submissions from the same email/phone.
    const existingPending = await (
      prisma as {
        staffRegistrationRequest?: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
      }
    ).staffRegistrationRequest?.findFirst?.({
      where: { status: 'PENDING', OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json(
        { success: false, message: 'You already have a pending registration request under review.' },
        { status: 400 }
      );
    }

    const created = await delegate.create({
      data: {
        legalName,
        dateOfBirth,
        email,
        phone,
        role,
        specialization,
        province,
        idDocumentUrl,
        certificateUrls,
      },
    });

    notifyTicketsStaffRegistration({
      id: created.id,
      legalName,
      dateOfBirth: dateOfBirth.toISOString().slice(0, 10),
      email,
      phone,
      role,
      specialization,
      province,
      idDocumentUrl,
      certificateUrls,
    }).catch((e) => console.error('Staff registration notification:', e));

    return NextResponse.json({
      success: true,
      message: 'Your request has been submitted. You will receive an email once it is reviewed.',
    });
  } catch (err) {
    console.error('POST /api/staff-registrations:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit your request. Please try again.' },
      { status: 500 }
    );
  }
}
