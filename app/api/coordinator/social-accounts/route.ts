import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const list = await prisma.coordinatorSocialAccount.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json({
      success: true,
      accounts: list.map((a) => ({
        id: a.id,
        platform: a.platform,
        accountId: a.accountId,
        messageCount: a._count.messages,
        createdAt: a.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/social-accounts:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (!platform || !accountId) {
      return NextResponse.json({ success: false, message: 'platform and accountId are required' }, { status: 400 });
    }
    if (!['linkedin', 'meta', 'whatsapp'].includes(platform)) {
      return NextResponse.json({ success: false, message: 'platform must be linkedin, meta, or whatsapp' }, { status: 400 });
    }
    const tokenEnc = typeof body.tokenEnc === 'string' ? body.tokenEnc.trim() || null : null;
    const account = await prisma.coordinatorSocialAccount.create({
      data: { companyId: payload.companyId, platform, accountId, tokenEnc },
    });
    return NextResponse.json({ success: true, account: { id: account.id, platform: account.platform, accountId: account.accountId, createdAt: account.createdAt } });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/social-accounts:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
