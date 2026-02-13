import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  try {
    const count = await prisma.cvExport.count();
    return NextResponse.json({ success: true, count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('cv_exports') || msg.includes('CvExport') || (e as { code?: string })?.code === 'P2021') {
      return NextResponse.json({ success: true, count: 0 });
    }
    console.error('GET /api/admin/cv-stats:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
