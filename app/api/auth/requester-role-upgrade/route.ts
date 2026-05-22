import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyTicketsRegistrationRequest } from '@/lib/email';

/**
 * GET — pending company-role upgrade request for the logged-in PERSONAL account.
 * POST — submit upgrade request (admin approves via registration-requests).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth?.payload?.requesterId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (auth.payload.identitySource === 'coordinator_user') {
      return NextResponse.json({ success: true, eligible: false, reason: 'COORDINATOR_ACCOUNT' });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, role: true },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }
    if (requester.role !== 'PERSONAL') {
      return NextResponse.json({ success: true, eligible: false, reason: 'NOT_PERSONAL' });
    }

    const pending = await prisma.registrationRequest.findFirst({
      where: {
        requesterId: requester.id,
        role: 'COMPANY',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        legalName: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    const lastRejected = !pending
      ? await prisma.registrationRequest.findFirst({
          where: {
            requesterId: requester.id,
            role: 'COMPANY',
            status: 'REJECTED',
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            legalName: true,
            status: true,
            rejectionReason: true,
            createdAt: true,
          },
        })
      : null;

    return NextResponse.json({
      success: true,
      eligible: true,
      pending: pending
        ? {
            id: pending.id,
            companyName: pending.legalName,
            status: pending.status,
            createdAt: pending.createdAt,
          }
        : null,
      lastRejected: lastRejected
        ? {
            id: lastRejected.id,
            companyName: lastRejected.legalName,
            status: lastRejected.status,
            rejectionReason: lastRejected.rejectionReason,
            createdAt: lastRejected.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /api/auth/requester-role-upgrade:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load company upgrade status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth?.payload?.requesterId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator accounts cannot use this flow.' },
      { status: 400 }
    );
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      }
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
    }
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const evidenceUrl = typeof body.evidenceUrl === 'string' ? body.evidenceUrl.trim() : '';
    const emailOverride =
      typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;

    if (!companyName) {
      return NextResponse.json(
        { success: false, message: 'Company name is required' },
        { status: 400 }
      );
    }
    if (!evidenceUrl) {
      return NextResponse.json(
        { success: false, message: 'Company certificate or license document is required' },
        { status: 400 }
      );
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: {
        id: true,
        role: true,
        phone: true,
        email: true,
        province: true,
        name: true,
        status: true,
      },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }
    if (requester.role !== 'PERSONAL') {
      return NextResponse.json(
        { success: false, message: 'Only individual accounts can request a company upgrade.' },
        { status: 400 }
      );
    }
    if (requester.status === 'BLOCKED' || requester.status === 'SUSPENDED') {
      return NextResponse.json(
        { success: false, message: 'Your account is not active.' },
        { status: 403 }
      );
    }

    const existingPending = await prisma.registrationRequest.findFirst({
      where: {
        requesterId: requester.id,
        role: 'COMPANY',
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json(
        {
          success: false,
          message: 'You already have a pending company upgrade request.',
          code: 'PENDING_EXISTS',
        },
        { status: 409 }
      );
    }

    const email = emailOverride || requester.email?.trim().toLowerCase() || '';
    if (!email) {
      return NextResponse.json(
        {
          success: false,
          message: 'Add an email to your profile before requesting a company account.',
        },
        { status: 400 }
      );
    }

    const province = (requester.province ?? '').trim() || 'N/A';

    const created = await prisma.registrationRequest.create({
      data: {
        legalName: companyName,
        phone: requester.phone,
        email,
        province,
        evidenceUrl,
        role: 'COMPANY',
        requesterId: requester.id,
      },
      select: { id: true, createdAt: true },
    });

    notifyTicketsRegistrationRequest({
      id: created.id,
      legalName: `${companyName} (upgrade from individual)`,
      phone: requester.phone,
      email,
      province,
      evidenceUrl,
      role: 'COMPANY',
    }).catch((e) => console.error('Role upgrade admin notify:', e));

    return NextResponse.json({
      success: true,
      message: 'Company upgrade request submitted. An admin will review it shortly.',
      request: {
        id: created.id,
        companyName,
        status: 'PENDING',
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    console.error('POST /api/auth/requester-role-upgrade:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit upgrade request' },
      { status: 500 }
    );
  }
}
