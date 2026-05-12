import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function notifyRequesterRequestUpdated(requesterId: string, companyId: string, status: string) {
  try {
    await notifyRequesterI18n({
      prisma,
      type: 'material_request_updated',
      requesterId,
      payload: {
        key: 'material_request_updated',
        vars: { status },
      },
      data: { scope: 'private_company', companyId },
    });
  } catch (e) {
    console.error('notifyRequesterRequestUpdated', e);
  }
}

const REQUEST_INCLUDE = {
  requester: { select: { id: true, name: true, username: true, phone: true, role: true } },
  material: { select: { id: true, name: true, unit: true } },
  responder: { select: { id: true, name: true, username: true } },
};

/**
 * PATCH /api/provisor-private-company/warehouse/requests/:id
 *
 * Body:
 *   { action: 'accept' | 'reject' | 'fulfill' | 'cancel' | 'confirm_received',
 *     responseNote?: string,
 *     fulfilledItemId?: string,
 *     receivedNote?: string   // optional, for confirm_received
 *   }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '').toLowerCase();
  const responseNote =
    typeof body?.responseNote === 'string' ? body.responseNote.trim() || null : null;
  const fulfilledItemId =
    typeof body?.fulfilledItemId === 'string' ? body.fulfilledItemId.trim() || null : null;
  const receivedNote =
    typeof body?.receivedNote === 'string' ? body.receivedNote.trim() || null : null;

  const row = await prisma.privateCompanyMaterialRequest.findFirst({
    where: { id, companyId: guard.companyId },
    select: { id: true, status: true, requesterId: true, responderId: true },
  });
  if (!row) return NextResponse.json({ success: false, message: 'Not found.' }, { status: 404 });

  if (action === 'confirm_received') {
    if (row.requesterId !== guard.requesterId) {
      return NextResponse.json(
        { success: false, message: 'Only the requester can confirm receipt.' },
        { status: 403 }
      );
    }
    if (row.status !== 'AWAITING_RECEIPT') {
      return NextResponse.json(
        { success: false, message: 'This request is not waiting for your receipt confirmation.' },
        { status: 409 }
      );
    }
    const updated = await prisma.privateCompanyMaterialRequest.update({
      where: { id },
      data: {
        status: 'FULFILLED',
        receivedAt: new Date(),
        receivedNote: receivedNote ?? null,
      },
      include: REQUEST_INCLUDE,
    });
    const rid = row.responderId as string | null;
    if (rid) {
      await notifyRequesterRequestUpdated(rid, guard.companyId, 'FULFILLED');
    }
    return NextResponse.json({
      success: true,
      request: updated,
      message: 'Receipt confirmed. Thank you.',
    });
  }

  if (action === 'cancel') {
    if (row.requesterId !== guard.requesterId) {
      return NextResponse.json({ success: false, message: 'You can only cancel your own requests.' }, { status: 403 });
    }
    if (row.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Only pending requests can be cancelled.' },
        { status: 409 }
      );
    }
    const updated = await prisma.privateCompanyMaterialRequest.update({
      where: { id },
      data: { status: 'CANCELLED', responseNote: responseNote ?? 'Cancelled by requester.' },
      include: REQUEST_INCLUDE,
    });
    return NextResponse.json({ success: true, request: updated });
  }

  if (!guard.canMutateWarehouse) {
    return NextResponse.json(
      { success: false, message: 'Only a warehouse keeper or the owner can update this request.' },
      { status: 403 }
    );
  }

  const st = String(row.status);
  let nextStatus: string | null = null;
  if (action === 'accept') {
    if (st !== 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Only pending requests can be accepted.' },
        { status: 409 }
      );
    }
    nextStatus = 'ACCEPTED';
  } else if (action === 'reject') {
    if (st !== 'PENDING' && st !== 'ACCEPTED') {
      return NextResponse.json({ success: false, message: 'This request is already closed.' }, { status: 409 });
    }
    nextStatus = 'REJECTED';
  } else if (action === 'fulfill') {
    if (st !== 'PENDING' && st !== 'ACCEPTED') {
      return NextResponse.json({ success: false, message: 'This request is already closed.' }, { status: 409 });
    }
    nextStatus = 'AWAITING_RECEIPT';
  } else {
    return NextResponse.json({ success: false, message: 'Unknown action.' }, { status: 400 });
  }

  if ((action === 'reject' || action === 'fulfill') && !responseNote) {
    return NextResponse.json(
      { success: false, message: 'Please add a short response note for the requester.' },
      { status: 400 }
    );
  }

  if (action === 'fulfill' && fulfilledItemId) {
    const item = await prisma.privateCompanyMaterialItem.findFirst({
      where: { id: fulfilledItemId, companyId: guard.companyId },
      select: { id: true },
    });
    if (!item) {
      return NextResponse.json({ success: false, message: 'fulfilledItemId not found in workspace.' }, { status: 400 });
    }
  }

  const updated = await prisma.privateCompanyMaterialRequest.update({
    where: { id },
    data: {
      status: nextStatus,
      responderId: guard.requesterId,
      responseNote: responseNote ?? (action === 'accept' ? 'Accepted for processing.' : null),
      fulfilledItemId: action === 'fulfill' ? fulfilledItemId : null,
      receivedAt: action === 'fulfill' ? null : null,
      receivedNote: action === 'fulfill' ? null : null,
    },
    include: REQUEST_INCLUDE,
  });

  await notifyRequesterRequestUpdated(row.requesterId as string, guard.companyId, nextStatus);

  const msg =
    action === 'fulfill'
      ? 'Materials marked as dispatched. The requester must confirm receipt to close the request.'
      : `Request marked as ${nextStatus}.`;

  return NextResponse.json({
    success: true,
    request: updated,
    message: msg,
  });
}
