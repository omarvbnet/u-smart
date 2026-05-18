import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { isEligibleForTicketApiRequest } from '@/lib/ticket-api-key-auth';

/**
 * GET — API access request status + active key prefixes for the logged-in account.
 * POST — submit a new API access request (admin approves and issues key).
 */
export async function GET(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth?.payload?.requesterId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json({ success: true, eligible: false, reason: 'COORDINATOR_ACCOUNT' });
  }

  const requester = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { id: true, role: true, status: true },
  });
  if (!requester) {
    return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
  }
  if (!isEligibleForTicketApiRequest(requester.role)) {
    return NextResponse.json({ success: true, eligible: false, reason: 'ROLE_NOT_ELIGIBLE' });
  }

  const reqDelegate = (prisma as { ticketApiKeyAccessRequest?: { findFirst: Function; findMany: Function } })
    .ticketApiKeyAccessRequest;
  const keyDelegate = (prisma as { ticketApiKey?: { findMany: Function } }).ticketApiKey;
  if (!reqDelegate?.findFirst) {
    return NextResponse.json({ success: true, eligible: true, pending: null, keys: [], lastRejected: null });
  }

  const pending = await reqDelegate.findFirst({
    where: { requesterId: requester.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      useCase: true,
      label: true,
      status: true,
      createdAt: true,
    },
  });

  const lastRejected = !pending
    ? await reqDelegate.findFirst({
        where: { requesterId: requester.id, status: 'REJECTED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          useCase: true,
          label: true,
          status: true,
          rejectionReason: true,
          createdAt: true,
        },
      })
    : null;

  let keys: Array<{
    id: string;
    keyPrefix: string;
    label: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
  }> = [];
  if (keyDelegate?.findMany) {
    keys = await keyDelegate.findMany({
      where: { requesterId: requester.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  return NextResponse.json({
    success: true,
    eligible: true,
    pending,
    lastRejected,
    keys,
  });
}

export async function POST(req: NextRequest) {
  const auth = getRequesterFromRequest(req);
  if (!auth?.payload?.requesterId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if (auth.payload.identitySource === 'coordinator_user') {
    return NextResponse.json(
      { success: false, message: 'Coordinator accounts cannot request ticket API keys.' },
      { status: 400 }
    );
  }

  const requester = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { id: true, role: true, status: true, name: true, company: true },
  });
  if (!requester) {
    return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
  }
  if (requester.status === 'BLOCKED' || requester.status === 'SUSPENDED') {
    return NextResponse.json({ success: false, message: 'Account is not active.' }, { status: 403 });
  }
  if (!isEligibleForTicketApiRequest(requester.role)) {
    return NextResponse.json(
      {
        success: false,
        message: 'Only company accounts and workspace managers/coordinators can request API access.',
      },
      { status: 403 }
    );
  }

  const reqDelegate = (prisma as { ticketApiKeyAccessRequest?: { findFirst: Function; create: Function } })
    .ticketApiKeyAccessRequest;
  if (!reqDelegate?.create) {
    return NextResponse.json({ success: false, message: 'Feature not available' }, { status: 503 });
  }

  const existingPending = await reqDelegate.findFirst({
    where: { requesterId: requester.id, status: 'PENDING' },
    select: { id: true },
  });
  if (existingPending) {
    return NextResponse.json(
      { success: false, message: 'You already have a pending API access request.' },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const useCase = typeof body.useCase === 'string' ? body.useCase.trim().slice(0, 2000) : '';
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
    if (!useCase) {
      return NextResponse.json(
        { success: false, message: 'Describe how you will use the API (integration purpose).' },
        { status: 400 }
      );
    }

    const created = await reqDelegate.create({
      data: {
        requesterId: requester.id,
        useCase,
        label: label || null,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json({ success: true, request: created });
  } catch (err) {
    console.error('POST /api/ticket-api-keys/request:', err);
    return NextResponse.json({ success: false, message: 'Failed to submit request' }, { status: 500 });
  }
}
