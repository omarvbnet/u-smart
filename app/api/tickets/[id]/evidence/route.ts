import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const evidence = await prisma.ticketEvidence.findMany({
      where: { visitorRequestId: params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        uploadedById: true,
        uploadedByName: true,
        fileUrl: true,
        fileType: true,
        description: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, evidence });
  } catch (error) {
    console.error('GET /api/tickets/[id]/evidence:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch evidence' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const fileUrl = typeof body.fileUrl === 'string' ? body.fileUrl.trim() : '';
    const fileType = typeof body.fileType === 'string' ? body.fileType.trim() : 'image';
    const description = typeof body.description === 'string' ? body.description.trim() : null;

    if (!fileUrl) {
      return NextResponse.json({ success: false, message: 'fileUrl is required' }, { status: 400 });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { name: true, username: true },
    });

    const evidence = await prisma.ticketEvidence.create({
      data: {
        visitorRequestId: params.id,
        uploadedById: auth.payload.requesterId,
        uploadedByName: requester?.name || requester?.username || 'Unknown',
        fileUrl,
        fileType,
        description,
      },
      select: {
        id: true,
        uploadedById: true,
        uploadedByName: true,
        fileUrl: true,
        fileType: true,
        description: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, evidence });
  } catch (error) {
    console.error('POST /api/tickets/[id]/evidence:', error);
    return NextResponse.json({ success: false, message: 'Failed to add evidence' }, { status: 500 });
  }
}
