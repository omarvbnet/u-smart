import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    await prisma.cvExport.create({ data: {} });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('cv_exports') || msg.includes('CvExport') || (e as { code?: string })?.code === 'P2021') {
      return NextResponse.json({ success: true });
    }
    console.error('POST /api/cv/track-export:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
