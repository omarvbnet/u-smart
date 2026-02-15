import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

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
      include: { user: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('GET /api/admin/products:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch products' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      return NextResponse.json({ success: false, message: 'No admin user found' }, { status: 400 });
    }

    const slug = body.slug || slugify(body.title || 'product');
    const productType =
      ['KNX', 'Buspro', 'Zigbee'].includes(body.productType) ? body.productType : 'KNX';

    const product = await prisma.product.create({
      data: {
        title: body.title || 'Untitled',
        slug: body.slug || slug,
        description: body.description || '',
        specifications: body.specifications ?? null,
        userManualUrl: body.userManualUrl ?? null,
        imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
        productType,
        featured: Boolean(body.featured),
        translations: body.translations ?? null,
        userId: admin.id,
      },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('POST /api/admin/products:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create product' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
