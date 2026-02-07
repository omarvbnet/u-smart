import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });
  }

  try {
    const checklist = await (prisma as any).inspectionChecklist.findUnique({
      where: { id },
    });
    if (!checklist) {
      return NextResponse.json({ success: false, message: 'Checklist not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, checklist });
  } catch (err) {
    console.error('GET /api/admin/checklists/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch checklist' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    let items = undefined;
    if (Array.isArray(body.items)) {
      items = body.items
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
    }

    const updateData: { name?: string; items?: unknown } = {};
    if (name !== undefined) updateData.name = name;
    if (items !== undefined) updateData.items = items;

    if (Object.keys(updateData).length === 0) {
      const checklist = await (prisma as any).inspectionChecklist.findUnique({ where: { id } });
      if (!checklist) return NextResponse.json({ success: false, message: 'Checklist not found' }, { status: 404 });
      return NextResponse.json({ success: true, checklist });
    }

    const checklist = await (prisma as any).inspectionChecklist.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ success: true, checklist });
  } catch (err) {
    console.error('PATCH /api/admin/checklists/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to update checklist' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'ID required' }, { status: 400 });
  }

  try {
    await (prisma as any).inspectionChecklist.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/checklists/[id]:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete checklist' }, { status: 500 });
  }
}
