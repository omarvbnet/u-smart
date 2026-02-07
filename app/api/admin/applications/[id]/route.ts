import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
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
