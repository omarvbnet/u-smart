import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const checklists = await (prisma as any).inspectionChecklist.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, checklists });
  } catch (err) {
    console.error('GET /api/admin/checklists:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch checklists' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw
      .filter((x: unknown) => x && typeof x === 'object' && 'label' in x && typeof (x as { label: unknown }).label === 'string')
      .map((x: { label: string; id?: string; weight?: string }) => {
        const w = typeof x.weight === 'string' && (x.weight === 'minor' || x.weight === 'major') ? x.weight : 'minor';
        return {
          id: typeof x.id === 'string' ? x.id : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          label: String(x.label).trim(),
          weight: w,
        };
      })
      .filter((x: { label: string }) => x.label.length > 0);

    if (!name) {
      return NextResponse.json(
        { success: false, message: 'Checklist name is required' },
        { status: 400 }
      );
    }

    const checklist = await (prisma as any).inspectionChecklist.create({
      data: { name, items },
    });
    return NextResponse.json({ success: true, checklist });
  } catch (err) {
    console.error('POST /api/admin/checklists:', err);
    return NextResponse.json({ success: false, message: 'Failed to create checklist' }, { status: 500 });
  }
}
