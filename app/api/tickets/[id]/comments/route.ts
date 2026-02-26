import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
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

    return NextResponse.json({ success: true, comments });
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
    const body = await req.json();
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) {
      return NextResponse.json({ success: false, message: 'Comment body is required' }, { status: 400 });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { name: true, username: true },
    });

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

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    console.error('POST /api/tickets/[id]/comments:', error);
    return NextResponse.json({ success: false, message: 'Failed to add comment' }, { status: 500 });
  }
}
