import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedEmailFromCookie } from '@/lib/otp-auth';

export async function POST(req: NextRequest) {
  try {
    const verifiedEmail = await getVerifiedEmailFromCookie();
    if (!verifiedEmail) {
      return NextResponse.json(
        { success: false, message: 'Email verification required. Please verify your email first.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const pocName = typeof body.pocName === 'string' ? body.pocName.trim() : '';
    const pocEmail = typeof body.pocEmail === 'string' ? body.pocEmail.trim().toLowerCase() : '';
    const pocPhone = typeof body.pocPhone === 'string' ? body.pocPhone.trim() : '';
    const certificateUrl = typeof body.certificateUrl === 'string' ? body.certificateUrl.trim() || null : null;
    const serviceSlug = typeof body.serviceSlug === 'string' ? body.serviceSlug.trim().toLowerCase() : 'enterprise-networking';
    const validSlugs = ['enterprise-networking', 'quality-control-supervision'];
    const finalServiceSlug = validSlugs.includes(serviceSlug) ? serviceSlug : 'enterprise-networking';

    if (!companyName || !pocName || !pocPhone || !pocEmail) {
      return NextResponse.json(
        { success: false, message: 'Company name, POC name, POC email, and POC phone are required' },
        { status: 400 }
      );
    }

    if (pocEmail !== verifiedEmail) {
      return NextResponse.json(
        { success: false, message: 'Email must match the verified email address.' },
        { status: 400 }
      );
    }

    let request: { id: string };
    try {
      request = await prisma.companyRequest.create({
        data: {
          companyName,
          pocName,
          pocEmail,
          pocPhone,
          certificateUrl,
          serviceSlug: finalServiceSlug,
        },
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? '');
      const delegate = prisma as { companyRequest?: { create: (args: unknown) => Promise<{ id: string }> } };
      if (msg.includes('Unknown argument') && delegate.companyRequest?.create) {
        request = await delegate.companyRequest.create({
          data: { companyName, pocName, pocEmail, pocPhone, certificateUrl, serviceSlug: finalServiceSlug },
        });
      } else {
        throw err;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Request submitted. We will review and create your dashboard.',
      requestId: request.id,
    });
  } catch (err) {
    console.error('POST /api/company-requests:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit request' },
      { status: 500 }
    );
  }
}
