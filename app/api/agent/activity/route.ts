import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent/auth-context';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 40)));

  try {
    if (conversationId && prisma.uAgentMessage?.findMany) {
      const conv = await prisma.uAgentConversation.findFirst({
        where: { id: conversationId, userId: auth.ctx.userId },
        select: { id: true },
      });
      if (!conv) {
        return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
      }
      const messages = await prisma.uAgentMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      return NextResponse.json({ success: true, messages });
    }

    const executions = prisma.uAgentExecution?.findMany
      ? await prisma.uAgentExecution.findMany({
          where: {
            userId: auth.ctx.userId,
            ...(auth.ctx.privateCompanyId
              ? { privateCompanyId: auth.ctx.privateCompanyId }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            status: true,
            timeline: true,
            resultSummary: true,
            currentTool: true,
            createdAt: true,
            completedAt: true,
          },
        })
      : [];

    return NextResponse.json({ success: true, activity: executions });
  } catch (e) {
    console.error('GET /api/agent/activity:', e);
    return NextResponse.json({ success: false, message: 'Failed to load activity' }, { status: 500 });
  }
}
