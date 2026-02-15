import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};
    if (typeof body.title === 'string') updateData.title = body.title;
    if (typeof body.slug === 'string') updateData.slug = body.slug;
    if (typeof body.description === 'string') updateData.description = body.description;
    if (body.specifications !== undefined) updateData.specifications = body.specifications;
    if (body.userManualUrl !== undefined) updateData.userManualUrl = body.userManualUrl;
    if (Array.isArray(body.imageUrls)) updateData.imageUrls = body.imageUrls;
    if (['KNX', 'Buspro', 'Zigbee'].includes(body.productType)) updateData.productType = body.productType;
    if (typeof body.featured === 'boolean') updateData.featured = body.featured;
    if (body.translations !== undefined) updateData.translations = body.translations;

    if (body.title && !body.slug) updateData.slug = slugify(body.title);

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('PATCH /api/admin/products/[id]:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update product' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/products/[id]:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete product' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
