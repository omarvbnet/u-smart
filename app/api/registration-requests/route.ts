import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyTicketsRegistrationRequest } from '@/lib/email';

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
    const roleRaw = typeof body.role === 'string' ? body.role.toUpperCase().trim() : '';
    if (roleRaw === 'ENGINEER' || roleRaw === 'TECHNICIAN') {
      return NextResponse.json(
        { success: false, message: 'Engineer and Technician roles can only be assigned by admin. Please register as Company or Personal.' },
        { status: 400 }
      );
    }
    const role = VALID_ROLES.includes(roleRaw as (typeof VALID_ROLES)[number]) ? roleRaw : 'COMPANY';

    if (!legalName || !phone || !email || !province || !evidenceUrl) {
      return NextResponse.json(
        { success: false, message: 'Legal name, phone, email, province, and identification evidence are required' },
        { status: 400 }
      );
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
        evidenceUrl,
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
