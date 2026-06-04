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

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'P2021' || code === 'P2010') return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('does not exist') && msg.includes('staff_registration_requests');
}

/**
 * Idempotently ensure the staff_registration_requests table exists. This is a
 * safety net for environments where `prisma migrate deploy` has not yet created
 * the table. The referenced enum types (RequesterRole, RequesterSpecialization,
 * RegistrationRequestStatus) already exist from earlier migrations.
 */
async function ensureStaffRegistrationTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "staff_registration_requests" (
      "id" TEXT NOT NULL,
      "legalName" TEXT NOT NULL,
      "dateOfBirth" TIMESTAMP(3) NOT NULL,
      "email" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "role" "RequesterRole" NOT NULL,
      "specialization" "RequesterSpecialization",
      "province" TEXT NOT NULL,
      "idDocumentUrl" TEXT NOT NULL,
      "certificateUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
      "rejectionReason" TEXT,
      "username" TEXT,
      "passwordHash" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "staff_registration_requests_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "staff_registration_requests_status_idx" ON "staff_registration_requests"("status");`
  );
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
    // Tolerate a missing table here (handled/created during the create step below).
    try {
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
    } catch (e) {
      if (!isMissingTableError(e)) throw e;
    }

    const data = {
      legalName,
      dateOfBirth,
      email,
      phone,
      role,
      specialization,
      province,
      idDocumentUrl,
      certificateUrls,
    };

    let created: { id: string };
    try {
      created = await delegate.create({ data });
    } catch (e) {
      if (isMissingTableError(e)) {
        await ensureStaffRegistrationTable();
        created = await delegate.create({ data });
      } else {
        throw e;
      }
    }

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
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/staff-registrations:', code, message, err);

    // Table not created yet (migration not applied on this environment).
    if (code === 'P2021' || code === 'P2022') {
      return NextResponse.json(
        {
          success: false,
          message:
            'Staff registration is being set up. Please try again shortly or contact support.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to submit your request. Please try again.',
        // Diagnostic detail (safe: no secrets). Helps surface the root cause in production logs/clients.
        error: code ? `${code}: ${message}` : message,
      },
      { status: 500 }
    );
  }
}
