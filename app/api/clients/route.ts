import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const list = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, clients: list });
  } catch (error) {
    console.error('GET /api/clients:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch clients' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = await prisma.client.create({
      data: {
        name: body.name || 'Unnamed',
        logo: body.logo ?? '',
        website: body.website ?? null,
        industry: body.industry ?? null,
        testimonial: body.testimonial ?? null,
        featured: Boolean(body.featured),
      },
    });
    return NextResponse.json({ success: true, client });
  } catch (error) {
    console.error('POST /api/clients:', error);
    return NextResponse.json({ success: false, message: 'Failed to create client' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
