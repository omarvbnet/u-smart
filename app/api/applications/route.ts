import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const coverLetter = typeof body.coverLetter === 'string' ? body.coverLetter.trim() || null : null;
    const resumeUrl = typeof body.resumeUrl === 'string' ? body.resumeUrl.trim() : '';
    const careerId = typeof body.careerId === 'string' ? body.careerId.trim() : '';

    if (!name || !email || !phone || !resumeUrl || !careerId) {
      return NextResponse.json(
        { success: false, message: 'Name, email, phone, resume, and career are required' },
        { status: 400 }
      );
    }

    const career = await prisma.career.findUnique({ where: { id: careerId } });
    if (!career || career.status !== 'OPEN') {
      return NextResponse.json({ success: false, message: 'Job not found or closed' }, { status: 404 });
    }

    const application = await prisma.application.create({
      data: { name, email, phone, coverLetter, resumeUrl, careerId },
    });

    return NextResponse.json({ success: true, application });
  } catch (error) {
    console.error('POST /api/applications:', error);
    return NextResponse.json({ success: false, message: 'Failed to submit application' }, { status: 500 });
  }
}
