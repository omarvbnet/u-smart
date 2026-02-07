import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export async function GET() {
  try {
    const list = await prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ success: true, services: list });
  } catch (error) {
    console.error('GET /api/services:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch services' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      return NextResponse.json({ success: false, message: 'No admin user found' }, { status: 400 });
    }
    const slug = body.slug || slugify(body.title || 'service');
    const service = await prisma.service.create({
      data: {
        title: body.title || 'Untitled',
        slug: body.slug || slug,
        description: body.description || '',
        content: body.content ?? null,
        icon: body.icon || 'Box',
        features: Array.isArray(body.features) ? body.features : [],
        category: body.category || 'General',
        priceRange: body.priceRange ?? null,
        duration: body.duration ?? null,
        featured: Boolean(body.featured),
        imageUrl: body.imageUrl ?? null,
        userId: admin.id,
      },
    });
    return NextResponse.json({ success: true, service });
  } catch (error) {
    console.error('POST /api/services:', error);
    return NextResponse.json({ success: false, message: 'Failed to create service' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
