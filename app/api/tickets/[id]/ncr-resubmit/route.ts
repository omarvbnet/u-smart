import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRequesterToken, COOKIE_NAME } from '@/lib/requester-auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const requester = token ? verifyRequesterToken(token) : null;
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const row = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, company: true },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }
    if (row.requesterId !== requester.requesterId) {
      return NextResponse.json({ success: false, message: 'Not allowed to update this ticket' }, { status: 403 });
    }

    const body = await req.json();
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u: unknown) => typeof u === 'string') : [];

    let parsed: Record<string, unknown> = {};
    if (typeof row.company === 'string') {
      try {
        parsed = JSON.parse(row.company) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ success: false, message: 'Invalid ticket data' }, { status: 400 });
      }
    }
    if (!parsed._ticket) {
      return NextResponse.json({ success: false, message: 'Invalid ticket' }, { status: 400 });
    }

    const list = Array.isArray(parsed.ncrResubmissions) ? (parsed.ncrResubmissions as Array<Record<string, unknown>>) : [];
    list.push({
      at: new Date().toISOString(),
      by: 'requester',
      comment: comment || null,
      imageUrls,
      action: 'resubmit',
    });
    parsed.ncrResubmissions = list;

    await prisma.visitorRequest.update({
      where: { id },
      data: { company: JSON.stringify(parsed) },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/tickets/[id]/ncr-resubmit:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to submit NCR response' },
      { status: 500 }
    );
  }
}
