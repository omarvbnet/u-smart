import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, client });
  } catch (error) {
    console.error('GET /api/clients/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch client' }, { status: 500 });
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
    if (body.name !== undefined) update.name = body.name;
    if (body.logo !== undefined) update.logo = body.logo;
    if (body.website !== undefined) update.website = body.website;
    if (body.industry !== undefined) update.industry = body.industry;
    if (body.testimonial !== undefined) update.testimonial = body.testimonial;
    if (body.featured !== undefined) update.featured = Boolean(body.featured);

    const client = await prisma.client.update({
      where: { id },
      data: update as Parameters<typeof prisma.client.update>[0]['data'],
    });
    return NextResponse.json({ success: true, client });
  } catch (error) {
    console.error('PATCH /api/clients/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to update client' }, { status: 500 });
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
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete client' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
