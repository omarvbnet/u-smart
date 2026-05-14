import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  tryAutoConfirmExpiredMaintenanceAwaiting,
  finalizeMaintenanceAsCompleted,
  readMaintenanceAwaitingSince,
} from '@/lib/maintenance-requester-confirmation';

const prisma = _prisma as any;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(_req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  await tryAutoConfirmExpiredMaintenanceAwaiting(prisma, id);

  const ticket = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      status: true,
      technique: true,
      requesterId: true,
      beforeImageUrls: true,
      finishingImageUrls: true,
    },
  });
  if (!ticket?.requesterId || ticket.requesterId !== auth.payload.requesterId) {
    return NextResponse.json(
      { success: false, message: 'Only the ticket requester can confirm completion.' },
      { status: 403 }
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }
  const awaiting = readMaintenanceAwaitingSince(parsed);
  if (!awaiting) {
    return NextResponse.json(
      { success: false, message: 'This ticket is not waiting for your confirmation.' },
      { status: 400 }
    );
  }

  await finalizeMaintenanceAsCompleted(prisma, ticket);
  return NextResponse.json({ success: true, message: 'Maintenance marked completed.' });
}
