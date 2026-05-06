import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { visitorRequestSiteLogicalId, viewerHasSharedSiteTicketRead } from '@/lib/site-share-access';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

async function verifyTicketReadAccess(prismaClient: any, ticketId: string, requesterId: string): Promise<boolean> {
  const reqRow = await prismaClient.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  const role = reqRow?.role ?? 'COMPANY';

  const ticket = await prismaClient.visitorRequest.findFirst({
    where: { id: ticketId },
    select: { id: true, requesterId: true, siteName: true, company: true },
  });
  if (!ticket) return false;

  if (role === 'ENGINEER') {
    return true;
  }
  if (role === 'WORKER') {
    const w = await prismaClient.visitorRequest.findFirst({
      where: { id: ticketId, company: { contains: requesterId } },
      select: { id: true },
    });
    return !!w;
  }
  if (role === 'TECHNICIAN') {
    const w = await prismaClient.visitorRequest.findFirst({
      where: { id: ticketId, technique: { in: MAINTENANCE_TECHNIQUES } },
      select: { id: true },
    });
    return !!w;
  }
  if (ticket.requesterId === requesterId) return true;
  if (role === 'COMPANY' || role === 'PERSONAL') {
    const siteLogical = visitorRequestSiteLogicalId(ticket);
    if (ticket.requesterId && siteLogical) {
      return viewerHasSharedSiteTicketRead(prismaClient, requesterId, {
        requesterId: ticket.requesterId,
        siteName: siteLogical,
      });
    }
  }
  return false;
}

async function verifyTicketWriteAccess(prismaClient: any, ticketId: string, requesterId: string): Promise<boolean> {
  const reqRow = await prismaClient.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  const role = reqRow?.role ?? 'COMPANY';

  const ticket = await prismaClient.visitorRequest.findFirst({
    where: { id: ticketId },
    select: { id: true, requesterId: true },
  });
  if (!ticket) return false;

  if (role === 'ENGINEER') {
    const w = await prismaClient.visitorRequest.findFirst({
      where: { id: ticketId },
      select: { id: true },
    });
    return !!w;
  }
  if (role === 'WORKER') {
    const w = await prismaClient.visitorRequest.findFirst({
      where: { id: ticketId, company: { contains: requesterId } },
      select: { id: true },
    });
    return !!w;
  }
  if (role === 'TECHNICIAN') {
    const w = await prismaClient.visitorRequest.findFirst({
      where: { id: ticketId, technique: { in: MAINTENANCE_TECHNIQUES } },
      select: { id: true },
    });
    return !!w;
  }
  return ticket.requesterId === requesterId;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const hasAccess = await verifyTicketReadAccess(prisma, id, auth.payload.requesterId);
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
    const hasAccess = await verifyTicketWriteAccess(prisma, id, auth.payload.requesterId);
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

    try {
      const ticket = await prisma.visitorRequest.findUnique({
        where: { id },
        select: { requesterId: true, company: true },
      });
      if (ticket) {
        const company = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
        const assignedEngineerId = company?.assignedEngineerId;
        const authorName = requester?.name || requester?.username || '';

        if (authorRole === 'engineer' && ticket.requesterId) {
          await notifyRequesterI18n({
            prisma,
            type: 'comment_added',
            ticketId: id,
            requesterId: ticket.requesterId,
            payload: { key: 'comment_engineer_reply', vars: { authorName } },
            data: { ticketId: id, type: 'comment_added' },
          });
        } else if (authorRole === 'requester' && assignedEngineerId) {
          await notifyRequesterI18n({
            prisma,
            type: 'comment_added',
            ticketId: id,
            requesterId: assignedEngineerId as string,
            payload: { key: 'comment_company_reply', vars: { authorName } },
            data: { ticketId: id, type: 'comment_added' },
          });
        }
      }
    } catch (e) {
      console.error('Create comment notification:', e);
    }

    return NextResponse.json({ success: true, comment: commentWithRole });
  } catch (error) {
    console.error('POST /api/tickets/[id]/comments:', error);
    return NextResponse.json({ success: false, message: 'Failed to add comment' }, { status: 500 });
  }
}
