import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const serviceSlug = typeof body.serviceSlug === 'string' ? body.serviceSlug.trim() : '';
    const serviceTitle = typeof body.serviceTitle === 'string' ? body.serviceTitle.trim() : '';
    const serviceDesc = typeof body.serviceDesc === 'string' ? body.serviceDesc.trim() || null : null;
    const requesterName = typeof body.requesterName === 'string' ? body.requesterName.trim() : '';
    const requesterEmail = typeof body.requesterEmail === 'string' ? body.requesterEmail.trim() : '';
    const requesterPhone = typeof body.requesterPhone === 'string' ? body.requesterPhone.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() || null : null;
    const message = typeof body.message === 'string' ? body.message.trim() || null : null;
    const budget = typeof body.budget === 'string' ? body.budget.trim() || null : null;

    if (!serviceSlug || !serviceTitle || !requesterName || !requesterEmail || !requesterPhone) {
      return NextResponse.json(
        { success: false, message: 'Name, email, phone, and service are required' },
        { status: 400 }
      );
    }

    const trainingRequest = await prisma.trainingRequest.create({
      data: {
        serviceSlug,
        serviceTitle,
        serviceDesc,
        requesterName,
        requesterEmail,
        requesterPhone,
        company,
        message,
        budget,
      },
    });

    return NextResponse.json({ success: true, request: trainingRequest });
  } catch (error) {
    console.error('POST /api/training-requests:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to submit training request' },
      { status: 500 }
    );
  }
}
