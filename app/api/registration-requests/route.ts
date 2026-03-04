import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const legalName = typeof body.legalName === 'string' ? body.legalName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const evidenceUrl = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() : '';
    const role = body.role === 'ENGINEER' ? 'ENGINEER' : 'COMPANY';

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

    await delegate.create({
      data: {
        legalName,
        phone,
        email,
        province,
        evidenceUrl,
        role,
      },
    });

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
