import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

const APPLICATION_STATUSES = ['PENDING', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const;

function requireAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    const application = await prisma.application.findUnique({
      where: { id },
      include: { career: true },
    });
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, application });
  } catch (error) {
    console.error('GET /api/admin/applications/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch application' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    const body = await req.json();
    const status = typeof body.status === 'string' ? body.status.toUpperCase().trim() : '';
    if (!status || !APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
      return NextResponse.json(
        { success: false, message: 'Invalid status. Use one of: PENDING, REVIEWED, INTERVIEW, ACCEPTED, REJECTED' },
        { status: 400 }
      );
    }
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 });
    }
    const updated = await prisma.application.update({
      where: { id },
      data: { status: status as (typeof APPLICATION_STATUSES)[number] },
      include: { career: true },
    });
    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    console.error('PATCH /api/admin/applications/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update application' }, { status: 500 });
  }
}
