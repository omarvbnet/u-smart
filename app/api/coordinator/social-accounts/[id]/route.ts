import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { logAudit, getClientIp } from '@/lib/coordinator/audit';
import { CoordinatorRole } from '@prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorSocialAccount.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const body = await req.json();
    const data: { accountId?: string; tokenEnc?: string | null } = {};
    if (typeof body.accountId === 'string' && body.accountId.trim()) data.accountId = body.accountId.trim();
    if (typeof body.tokenEnc === 'string') data.tokenEnc = body.tokenEnc.trim() || null;
    const account = await prisma.coordinatorSocialAccount.update({
      where: { id },
      data,
    });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'social_account_update',
      resource: 'social_account',
      resourceId: id,
      payload: data,
      ip: getClientIp(req),
    });
    return NextResponse.json({ success: true, account: { id: account.id, platform: account.platform, accountId: account.accountId } });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/coordinator/social-accounts/[id]:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = requireCoordinatorRole(_req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const { id } = await params;
    const existing = await prisma.coordinatorSocialAccount.findFirst({
      where: { id, companyId: payload.companyId },
    });
    if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    await prisma.coordinatorSocialAccount.delete({ where: { id } });
    await logAudit({
      companyId: payload.companyId,
      userId: payload.sub,
      action: 'social_account_delete',
      resource: 'social_account',
      resourceId: id,
      payload: { platform: existing.platform, accountId: existing.accountId },
      ip: getClientIp(_req),
    });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/coordinator/social-accounts/[id]:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
