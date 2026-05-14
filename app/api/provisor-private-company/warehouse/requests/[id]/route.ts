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

async function idsWarehouseKeepers(companyId: string): Promise<string[]> {
  const rows: Array<{ id: string }> = await prisma.ticketRequester.findMany({
    where: {
      privateCompanyId: companyId,
      role: 'WAREHOUSE_KEEPER',
      status: { not: 'BLOCKED' },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function ownerRequesterId(companyId: string): Promise<string | null> {
  const c = await prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { ownerRequesterId: true },
  });
  return (c?.ownerRequesterId as string) ?? null;
}

async function notifyKeepersReceiptDisputed(args: {
  companyId: string;
  requestId: string;
  requesterLabel: string;
  summary: string;
  message: string;
}) {
  const ids = new Set(await idsWarehouseKeepers(args.companyId));
  const oid = await ownerRequesterId(args.companyId);
  if (oid) ids.add(oid);
  for (const requesterId of ids) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'material_request_receipt_disputed',
        requesterId,
        payload: {
          key: 'material_request_receipt_disputed',
          vars: {
            requesterLabel: args.requesterLabel,
            summary: args.summary,
            message: args.message,
          },
        },
        data: {
          scope: 'private_company',
          companyId: args.companyId,
          materialRequestId: args.requestId,
        },
      });
    } catch (e) {
      console.error('notifyKeepersReceiptDisputed', requesterId, e);
    }
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
 *   { action:
 *       'accept' | 'reject' | 'fulfill' | 'cancel' | 'confirm_received'
 *       | 'report_not_received' | 'keeper_ack_receipt_issue' | 'keeper_clear_receipt_issue',
 *     responseNote?: string,
 *     fulfilledItemId?: string,
 *     receivedNote?: string,
 *     message?: string   // required for report_not_received
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
    select: {
      id: true,
      status: true,
      requesterId: true,
      responderId: true,
      quantity: true,
      customTitle: true,
      notReceivedAt: true,
      material: { select: { name: true } },
    },
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
        notReceivedAt: null,
        notReceivedNote: null,
        receiptIssueAcknowledgedAt: null,
        receiptIssueAcknowledgedById: null,
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

  if (action === 'report_not_received') {
    if (row.requesterId !== guard.requesterId) {
      return NextResponse.json(
        { success: false, message: 'Only the requester can report a receipt problem.' },
        { status: 403 }
      );
    }
    if (row.status !== 'AWAITING_RECEIPT') {
      return NextResponse.json(
        { success: false, message: 'You can only report a problem while the request awaits your receipt confirmation.' },
        { status: 409 }
      );
    }
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return NextResponse.json(
        { success: false, message: 'Please describe what was missing or wrong.' },
        { status: 400 }
      );
    }
    const updated = await prisma.privateCompanyMaterialRequest.update({
      where: { id },
      data: {
        notReceivedAt: new Date(),
        notReceivedNote: message,
        receiptIssueAcknowledgedAt: null,
        receiptIssueAcknowledgedById: null,
      },
      include: REQUEST_INCLUDE,
    });
    const reqLabelRow = await prisma.ticketRequester.findUnique({
      where: { id: row.requesterId as string },
      select: { name: true, username: true },
    });
    const requesterLabel =
      reqLabelRow?.name?.trim() || reqLabelRow?.username?.trim() || 'Staff';
    const matName = (row.material as { name?: string } | null)?.name?.trim();
    const summary =
      matName && matName.length > 0
        ? `${matName} × ${row.quantity}`
        : `${(row.customTitle as string | null)?.trim() || 'Custom'} × ${row.quantity}`;
    await notifyKeepersReceiptDisputed({
      companyId: guard.companyId,
      requestId: id,
      requesterLabel,
      summary,
      message,
    });
    return NextResponse.json({
      success: true,
      request: updated,
      message: 'Warehouse has been notified. A keeper will follow up.',
    });
  }

  if (!guard.canMutateWarehouse) {
    return NextResponse.json(
      { success: false, message: 'Only a warehouse keeper or the owner can update this request.' },
      { status: 403 }
    );
  }

  const st = String(row.status);

  if (action === 'keeper_ack_receipt_issue') {
    if (st !== 'AWAITING_RECEIPT') {
      return NextResponse.json(
        { success: false, message: 'Receipt issues can only be acknowledged while awaiting receipt.' },
        { status: 409 }
      );
    }
    if (!row.notReceivedAt) {
      return NextResponse.json(
        { success: false, message: 'There is no open receipt issue on this request.' },
        { status: 409 }
      );
    }
    const updated = await prisma.privateCompanyMaterialRequest.update({
      where: { id },
      data: {
        receiptIssueAcknowledgedAt: new Date(),
        receiptIssueAcknowledgedById: guard.requesterId,
      },
      include: REQUEST_INCLUDE,
    });
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'material_request_issue_acknowledged',
        requesterId: row.requesterId as string,
        payload: {
          key: 'material_request_issue_acknowledged',
          vars: {},
        },
        data: {
          scope: 'private_company',
          companyId: guard.companyId,
          materialRequestId: id,
        },
      });
    } catch (e) {
      console.error('keeper_ack notify', e);
    }
    return NextResponse.json({
      success: true,
      request: updated,
      message: 'Receipt issue acknowledged. Coordinate re-delivery with the requester if needed.',
    });
  }

  if (action === 'keeper_clear_receipt_issue') {
    if (st !== 'AWAITING_RECEIPT') {
      return NextResponse.json(
        { success: false, message: 'Only open awaiting-receipt requests can be reset.' },
        { status: 409 }
      );
    }
    const updated = await prisma.privateCompanyMaterialRequest.update({
      where: { id },
      data: {
        notReceivedAt: null,
        notReceivedNote: null,
        receiptIssueAcknowledgedAt: null,
        receiptIssueAcknowledgedById: null,
      },
      include: REQUEST_INCLUDE,
    });
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'material_request_updated',
        requesterId: row.requesterId as string,
        payload: {
          key: 'material_request_updated',
          vars: { status: 'AWAITING_RECEIPT' },
        },
        data: { scope: 'private_company', companyId: guard.companyId, materialRequestId: id },
      });
    } catch (e) {
      console.error('keeper_clear notify', e);
    }
    return NextResponse.json({
      success: true,
      request: updated,
      message: 'Receipt issue flags cleared. The requester can confirm when materials arrive.',
    });
  }

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
      ...(action === 'fulfill'
        ? {
            notReceivedAt: null,
            notReceivedNote: null,
            receiptIssueAcknowledgedAt: null,
            receiptIssueAcknowledgedById: null,
          }
        : {}),
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
