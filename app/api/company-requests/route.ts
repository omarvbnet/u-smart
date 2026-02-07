import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const pocName = typeof body.pocName === 'string' ? body.pocName.trim() : '';
    const pocPhone = typeof body.pocPhone === 'string' ? body.pocPhone.trim() : '';
    const certificateUrl = typeof body.certificateUrl === 'string' ? body.certificateUrl.trim() || null : null;
    const serviceSlug = typeof body.serviceSlug === 'string' ? body.serviceSlug.trim().toLowerCase() : 'enterprise-networking';
    const validSlugs = ['enterprise-networking', 'quality-control-supervision'];
    const finalServiceSlug = validSlugs.includes(serviceSlug) ? serviceSlug : 'enterprise-networking';

    if (!companyName || !pocName || !pocPhone) {
      return NextResponse.json(
        { success: false, message: 'Company name, POC name, and POC phone are required' },
        { status: 400 }
      );
    }

    let request;
    try {
      request = await prisma.companyRequest.create({
        data: {
          companyName,
          pocName,
          pocPhone,
          certificateUrl,
          serviceSlug: finalServiceSlug,
        },
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? '');
      if (msg.includes('Unknown argument') && msg.includes('serviceSlug')) {
        request = await prisma.companyRequest.create({
          data: { companyName, pocName, pocPhone, certificateUrl },
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
