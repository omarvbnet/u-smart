import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const runtime = 'nodejs';

/** List the signed-in user's U Agent conversations (newest first). */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 20)));

  try {
    if (!prisma.uAgentConversation?.findMany) {
      return NextResponse.json({ success: true, conversations: [] });
    }

    const rows = await prisma.uAgentConversation.findMany({
      where: {
        userId: auth.ctx.userId,
        ...(auth.ctx.privateCompanyId
          ? {
              OR: [
                { privateCompanyId: auth.ctx.privateCompanyId },
                { privateCompanyId: null },
              ],
            }
          : {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    const conversations = rows.map((r: {
      id: string;
      title: string | null;
      status: string;
      lastMessageAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      _count?: { messages: number };
    }) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      lastMessageAt: r.lastMessageAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: r._count?.messages ?? 0,
    }));

    return NextResponse.json({ success: true, conversations });
  } catch (e) {
    console.error('GET /api/agent/conversations:', e);
    return NextResponse.json(
      { success: false, message: 'Failed to load conversations' },
      { status: 500 }
    );
  }
}
