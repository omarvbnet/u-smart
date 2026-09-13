import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function getOrCreateConversation(args: {
  userId: string;
  privateCompanyId: string | null;
  conversationId?: string | null;
}): Promise<{ id: string }> {
  if (!prisma.uAgentConversation?.create) {
    throw new Error('U Agent conversations unavailable. Run prisma migrate deploy.');
  }
  if (args.conversationId) {
    const existing = await prisma.uAgentConversation.findFirst({
      where: {
        id: args.conversationId,
        userId: args.userId,
        ...(args.privateCompanyId
          ? { OR: [{ privateCompanyId: args.privateCompanyId }, { privateCompanyId: null }] }
          : {}),
      },
      select: { id: true },
    });
    if (existing) return existing;
  }
  const created = await prisma.uAgentConversation.create({
    data: {
      userId: args.userId,
      privateCompanyId: args.privateCompanyId,
      title: null,
      status: 'ONLINE',
    },
    select: { id: true },
  });
  return created;
}

export async function appendMessage(args: {
  conversationId: string;
  userId?: string | null;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  attachments?: unknown;
  toolName?: string | null;
  toolCallId?: string | null;
}): Promise<void> {
  if (!prisma.uAgentMessage?.create) return;
  await prisma.uAgentMessage.create({
    data: {
      conversationId: args.conversationId,
      userId: args.userId ?? null,
      role: args.role,
      content: args.content.slice(0, 50000),
      attachments: args.attachments ?? undefined,
      toolName: args.toolName ?? null,
      toolCallId: args.toolCallId ?? null,
    },
  });
  if (prisma.uAgentConversation?.update) {
    await prisma.uAgentConversation.update({
      where: { id: args.conversationId },
      data: { lastMessageAt: new Date() },
    });
  }
}

export async function loadRecentMessages(
  conversationId: string,
  limit = 20
): Promise<Array<{ role: string; content: string; toolName?: string | null }>> {
  if (!prisma.uAgentMessage?.findMany) return [];
  const rows = await prisma.uAgentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, content: true, toolName: true },
  });
  return rows.reverse();
}
