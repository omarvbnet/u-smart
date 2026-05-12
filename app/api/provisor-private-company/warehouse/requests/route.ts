import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { normalizeProvince, warehouseGuard } from '@/lib/private-company-warehouse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const REQUEST_INCLUDE = {
  requester: { select: { id: true, name: true, username: true, phone: true, role: true } },
  material: { select: { id: true, name: true, unit: true } },
  responder: { select: { id: true, name: true, username: true } },
};

async function keeperIds(companyId: string): Promise<string[]> {
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

async function notifyKeepersNewRequest(
  companyId: string,
  vars: { requesterLabel: string; summary: string }
) {
  const ids = new Set(await keeperIds(companyId));
  const oid = await ownerRequesterId(companyId);
  if (oid) ids.add(oid);
  for (const requesterId of ids) {
    try {
      await notifyRequesterI18n({
        prisma,
        type: 'material_request_created',
        requesterId,
        payload: {
          key: 'material_request_created',
          vars: {
            requesterLabel: vars.requesterLabel,
            summary: vars.summary,
          },
        },
        data: { scope: 'private_company', companyId },
      });
    } catch (e) {
      console.error('notifyKeepersNewRequest', requesterId, e);
    }
  }
}

/**
 * GET /api/provisor-private-company/warehouse/requests?scope=mine|pending|all
 */
export async function GET(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const scope = (new URL(req.url).searchParams.get('scope') ?? 'mine').toLowerCase();
  const where: Record<string, unknown> = { companyId: guard.companyId };

  if (scope === 'mine') {
    where.requesterId = guard.requesterId;
  } else if (scope === 'pending' || scope === 'all') {
    if (!guard.canMutateWarehouse) {
      return NextResponse.json(
        { success: false, message: 'Only warehouse keepers or the owner can view all requests.' },
        { status: 403 }
      );
    }
    if (scope === 'pending') {
      where.OR = [{ status: 'PENDING' }, { status: 'ACCEPTED' }, { status: 'AWAITING_RECEIPT' }];
    }
  } else {
    return NextResponse.json({ success: false, message: 'Invalid scope.' }, { status: 400 });
  }

  const requests = await prisma.privateCompanyMaterialRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: REQUEST_INCLUDE,
  });

  return NextResponse.json({ success: true, requests });
}

/**
 * POST — any workspace member may submit a material request.
 */
export async function POST(req: NextRequest) {
  const guard = await warehouseGuard(req);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => ({}));
  const kindRaw = typeof body?.kind === 'string' ? body.kind.trim().toUpperCase() : '';
  const kind =
    kindRaw === 'CUSTOM_UNAVAILABLE' || kindRaw === 'NOT_AVAILABLE'
      ? 'CUSTOM_UNAVAILABLE'
      : kindRaw === 'INVENTORY_MATERIAL' || kindRaw === 'FROM_INVENTORY'
        ? 'INVENTORY_MATERIAL'
        : '';
  if (!kind) {
    return NextResponse.json(
      {
        success: false,
        message: 'kind must be INVENTORY_MATERIAL or CUSTOM_UNAVAILABLE.',
      },
      { status: 400 }
    );
  }
  const quantity =
    typeof body?.quantity === 'number' && body.quantity > 0 ? Math.floor(body.quantity) : 1;
  const notes = typeof body?.notes === 'string' ? body.notes.trim() || null : null;
  const province = body?.province !== undefined ? normalizeProvince(body.province) : null;

  let materialId: string | null = null;
  let customTitle: string | null = null;
  let customDescription: string | null = null;

  if (kind === 'INVENTORY_MATERIAL') {
    const mid = typeof body?.materialId === 'string' ? body.materialId.trim() : '';
    if (!mid) {
      return NextResponse.json(
        { success: false, message: 'materialId is required for catalog requests.' },
        { status: 400 }
      );
    }
    const m = await prisma.privateCompanyMaterial.findFirst({
      where: { id: mid, companyId: guard.companyId },
      select: { id: true },
    });
    if (!m) {
      return NextResponse.json({ success: false, message: 'Material not found in this workspace.' }, { status: 404 });
    }
    materialId = mid;
  } else {
    const title = typeof body?.customTitle === 'string' ? body.customTitle.trim() : '';
    if (!title) {
      return NextResponse.json(
        { success: false, message: 'customTitle is required when the item is not in the catalog.' },
        { status: 400 }
      );
    }
    customTitle = title;
    customDescription =
      typeof body?.customDescription === 'string' ? body.customDescription.trim() || null : null;
  }

  const created = await prisma.privateCompanyMaterialRequest.create({
    data: {
      companyId: guard.companyId,
      requesterId: guard.requesterId,
      kind,
      materialId,
      customTitle,
      customDescription,
      quantity,
      province,
      notes,
      status: 'PENDING',
    },
    include: REQUEST_INCLUDE,
  });

  const reqLabel =
    (created.requester?.name as string | undefined)?.trim() ||
    (created.requester?.username as string | undefined)?.trim() ||
    'Staff';
  const summary =
    kind === 'INVENTORY_MATERIAL' && created.material?.name
      ? `${created.material.name} × ${quantity}`
      : `${(customTitle as string) ?? 'Custom item'} × ${quantity}`;

  await notifyKeepersNewRequest(guard.companyId, {
    requesterLabel: reqLabel,
    summary,
  });

  return NextResponse.json({
    success: true,
    request: created,
    message: 'Request submitted. A warehouse keeper will review it.',
  });
}
