import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { sendPushToRequesters } from '@/lib/push-notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

async function verifyTicketAccess(prismaClient: any, ticketId: string, requesterId: string): Promise<boolean> {
  const reqRow = await prismaClient.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  const role = reqRow?.role ?? 'COMPANY';
  const where = role === 'ENGINEER' ? { id: ticketId } : { id: ticketId, requesterId };
  const ticket = await prismaClient.visitorRequest.findFirst({ where, select: { id: true } });
  return !!ticket;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const hasAccess = await verifyTicketAccess(prisma, id, auth.payload.requesterId);
    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const comments = await prisma.ticketComment.findMany({
      where: { visitorRequestId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        authorId: true,
        authorName: true,
        body: true,
        createdAt: true,
      },
    });

    const authorIds = [...new Set(comments.map((c: { authorId: string }) => c.authorId))];
    const requesters = authorIds.length > 0
      ? await prisma.ticketRequester.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, role: true },
        })
      : [];
    const roleByAuthor: Record<string, string> = {};
    for (const r of requesters) {
      roleByAuthor[r.id] = r.role === 'ENGINEER' ? 'engineer' : 'requester';
    }

    const commentsWithRole = comments.map((c: { id: string; authorId: string; authorName: string; body: string; createdAt: Date }) => ({
      ...c,
      authorRole: roleByAuthor[c.authorId] ?? 'requester',
    }));

    return NextResponse.json({ success: true, comments: commentsWithRole });
  } catch (error) {
    console.error('GET /api/tickets/[id]/comments:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const hasAccess = await verifyTicketAccess(prisma, id, auth.payload.requesterId);
    if (!hasAccess) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const body = await req.json();
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) {
      return NextResponse.json({ success: false, message: 'Comment body is required' }, { status: 400 });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { name: true, username: true, role: true },
    });

    const authorRole = requester?.role === 'ENGINEER' ? 'engineer' : 'requester';

    const comment = await prisma.ticketComment.create({
      data: {
        visitorRequestId: id,
        authorId: auth.payload.requesterId,
        authorName: requester?.name || requester?.username || 'Unknown',
        body: text,
      },
      select: {
        id: true,
        authorId: true,
        authorName: true,
        body: true,
        createdAt: true,
      },
    });

    const commentWithRole = { ...comment, authorRole };

    // Notify the other party: engineer -> notify requester (company); requester -> notify engineer
    if (typeof prisma.notification?.create === 'function') {
      try {
        const ticket = await prisma.visitorRequest.findUnique({
          where: { id },
          select: { requesterId: true, company: true },
        });
        if (ticket) {
          const company = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
          const assignedEngineerId = company?.assignedEngineerId;

          if (authorRole === 'engineer' && ticket.requesterId) {
            const message = `${requester?.name || requester?.username || 'Engineer'} replied on ticket`;
            await prisma.notification.create({
              data: {
                type: 'comment_added',
                title: 'New comment on your ticket',
                message,
                ticketId: id,
                requesterId: ticket.requesterId,
                forAdmin: false,
              },
            });
            await sendPushToRequesters(prisma, [ticket.requesterId], {
              title: 'New comment on your ticket',
              body: message,
              data: { ticketId: id, type: 'comment_added' },
            });
          } else if (authorRole === 'requester' && assignedEngineerId) {
            const message = `${requester?.name || requester?.username || 'Company'} replied on ticket`;
            await prisma.notification.create({
              data: {
                type: 'comment_added',
                title: 'Company replied on ticket',
                message,
                ticketId: id,
                requesterId: assignedEngineerId,
                forAdmin: false,
              },
            });
            await sendPushToRequesters(prisma, [assignedEngineerId], {
              title: 'Company replied on ticket',
              body: message,
              data: { ticketId: id, type: 'comment_added' },
            });
          }
        }
      } catch (e) {
        console.error('Create comment notification:', e);
      }
    }

    return NextResponse.json({ success: true, comment: commentWithRole });
  } catch (error) {
    console.error('POST /api/tickets/[id]/comments:', error);
    return NextResponse.json({ success: false, message: 'Failed to add comment' }, { status: 500 });
  }
}
