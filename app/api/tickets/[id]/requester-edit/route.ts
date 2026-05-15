import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { readResubmitMeta, RESUBMIT_TARGET_REQUESTER } from '@/lib/ticket-resubmit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * PATCH /api/tickets/[id]/requester-edit
 * Ticket requester may update ticket details while staff resubmit is awaiting their edits.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const row = await prisma.visitorRequest.findFirst({
    where: { id, requesterId: auth.payload.requesterId },
    select: {
      id: true,
      status: true,
      workflowState: true,
      company: true,
      maintenanceDescription: true,
    },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    return NextResponse.json(
      { success: false, message: 'Cannot edit a completed ticket.' },
      { status: 400 }
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    parsed = {};
  }

  const workflowState = String(row.workflowState ?? parsed.workflowState ?? '').toUpperCase();
  const { resubmitTarget } = readResubmitMeta(parsed);
  if (
    workflowState !== 'RESUBMITTED' ||
    resubmitTarget !== RESUBMIT_TARGET_REQUESTER
  ) {
    return NextResponse.json(
      {
        success: false,
        message: 'Edits are only allowed when staff have requested changes from you.',
      },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  if (typeof body.siteName === 'string' && body.siteName.trim()) {
    parsed.siteName = body.siteName.trim();
    data.siteName = body.siteName.trim();
  }
  if (typeof body.siteCoordinator === 'string') {
    parsed.siteCoordinator = body.siteCoordinator.trim();
  }
  if (typeof body.designSpecifications === 'string') {
    parsed.designSpecifications = body.designSpecifications.trim() || null;
  }
  if (Array.isArray(body.attachmentUrls)) {
    parsed.attachmentUrls = body.attachmentUrls.filter(
      (u: unknown) => typeof u === 'string' && u.trim()
    );
  }
  if (typeof body.maintenanceDescription === 'string') {
    data.maintenanceDescription = body.maintenanceDescription.trim() || null;
  }
  if (typeof body.maintenanceReason === 'string') {
    parsed.maintenanceReason = body.maintenanceReason.trim() || null;
  }

  data.company = JSON.stringify(parsed);

  await prisma.visitorRequest.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true, message: 'Ticket updated.' });
}
