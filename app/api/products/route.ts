import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/products – Public list of products (optional ?type=KNX|Buspro|Zigbee) */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get('type')?.toUpperCase();
    const type =
      typeParam && ['KNX', 'Buspro', 'Zigbee'].includes(typeParam)
        ? (typeParam as 'KNX' | 'Buspro' | 'Zigbee')
        : undefined;

    const products = await prisma.product.findMany({
      where: type ? { productType: type } : undefined,
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      include: { user: { select: { name: true } } },
    });

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('GET /api/products:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch products' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
