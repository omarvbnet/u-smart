import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCoordinatorRole } from '@/lib/coordinator/rbac';
import { CoordinatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR, CoordinatorRole.CLIENT]);
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const accounts = await prisma.coordinatorSocialAccount.findMany({
      where: { companyId: payload.companyId },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    const where = accountId
      ? { accountId, account: { companyId: payload.companyId } }
      : { accountId: { in: accountIds } };
    const list = await prisma.coordinatorOutreachMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { account: { select: { id: true, platform: true, accountId: true } } },
    });
    return NextResponse.json({
      success: true,
      messages: list.map((m) => ({
        id: m.id,
        accountId: m.accountId,
        platform: m.account.platform,
        recipient: m.recipient,
        body: m.body,
        sentAt: m.sentAt,
        replyAt: m.replyAt,
        taskId: m.taskId,
        createdAt: m.createdAt,
      })),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('GET /api/coordinator/outreach-messages:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = requireCoordinatorRole(req, [CoordinatorRole.ADMIN, CoordinatorRole.COORDINATOR]);
    const body = await req.json();
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
    const bodyText = typeof body.body === 'string' ? body.body.trim() : '';
    if (!accountId || !recipient || !bodyText) {
      return NextResponse.json({ success: false, message: 'accountId, recipient, and body are required' }, { status: 400 });
    }
    const account = await prisma.coordinatorSocialAccount.findFirst({
      where: { id: accountId, companyId: payload.companyId },
    });
    if (!account) return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() || null : null;
    const message = await prisma.coordinatorOutreachMessage.create({
      data: { accountId, recipient, body: bodyText, taskId },
    });
    return NextResponse.json({
      success: true,
      message: { id: message.id, accountId: message.accountId, recipient: message.recipient, body: message.body, sentAt: message.sentAt, taskId: message.taskId, createdAt: message.createdAt },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; json?: () => Promise<unknown> };
    if (err.status === 401) return NextResponse.json(await err.json!(), { status: 401 });
    if (err.status === 403) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    console.error('POST /api/coordinator/outreach-messages:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
