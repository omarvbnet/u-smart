import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    await prisma.$executeRaw`
      INSERT INTO cv_exports (id, "createdAt") VALUES (${randomUUID()}, NOW())
    `;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('cv_exports') || (e as { code?: string })?.code === 'P2021') {
      return NextResponse.json({ success: true });
    }
    console.error('POST /api/cv/track-export:', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
