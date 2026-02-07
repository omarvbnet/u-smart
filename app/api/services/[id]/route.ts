import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = await prisma.service.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!service) {
      return NextResponse.json({ success: false, message: 'Service not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, service });
  } catch (error) {
    console.error('GET /api/services/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch service' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.slug !== undefined) {
      const newSlug = String(body.slug).trim().toLowerCase();
      if (!newSlug) {
        return NextResponse.json({ success: false, message: 'Slug cannot be empty' }, { status: 400 });
      }
      const existing = await prisma.service.findFirst({
        where: { slug: newSlug, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, message: `Slug "${newSlug}" is already used by another service` },
          { status: 400 }
        );
      }
      update.slug = newSlug;
    }
    if (body.description !== undefined) update.description = body.description;
    if (body.content !== undefined) update.content = body.content;
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.features !== undefined) update.features = Array.isArray(body.features) ? body.features : [];
    if (body.category !== undefined) update.category = body.category;
    if (body.priceRange !== undefined) update.priceRange = body.priceRange;
    if (body.duration !== undefined) update.duration = body.duration;
    if (body.featured !== undefined) update.featured = Boolean(body.featured);
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
    if (body.translations !== undefined) update.translations = body.translations;

    const service = await prisma.service.update({
      where: { id },
      data: update as Parameters<typeof prisma.service.update>[0]['data'],
    });
    return NextResponse.json({ success: true, service });
  } catch (error) {
    const prismaError = error as { code?: string; meta?: { target?: string[] } };
    if (prismaError?.code === 'P2002' && prismaError?.meta?.target?.includes('slug')) {
      return NextResponse.json(
        { success: false, message: 'This slug is already used by another service. Please choose a unique slug.' },
        { status: 400 }
      );
    }
    console.error('PATCH /api/services/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update service' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.service.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/services/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete service' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
