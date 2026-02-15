import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/products/slug/[slug] – Public single product by slug */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const normalizedSlug = slug?.toLowerCase().trim() || '';

    const product = await prisma.product.findUnique({
      where: { slug: normalizedSlug },
      include: { user: { select: { name: true } } },
    });

    if (!product) {
      return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('GET /api/products/slug/[slug]:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch product' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
