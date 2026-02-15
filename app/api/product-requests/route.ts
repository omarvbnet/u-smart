import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

/** POST /api/product-requests – Public: create order request for a product */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const productSlug = typeof body.productSlug === 'string' ? body.productSlug.trim() : '';
    const productTitle = typeof body.productTitle === 'string' ? body.productTitle.trim() : '';
    const productType = body.productType as 'KNX' | 'Buspro' | 'Zigbee';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() || null : null;

    if (!name || !email || !phone) {
      return NextResponse.json(
        { success: false, message: 'Name, email, and phone are required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (!productId && !productSlug) {
      return NextResponse.json(
        { success: false, message: 'Product ID or slug is required' },
        { status: 400 }
      );
    }

    let product = null;
    if (productId) {
      product = await prisma.product.findUnique({ where: { id: productId } });
    }
    if (!product && productSlug) {
      product = await prisma.product.findUnique({ where: { slug: slugify(productSlug) } });
    }
    if (!product) {
      return NextResponse.json(
        { success: false, message: 'Product not found' },
        { status: 404 }
      );
    }

    const validType = ['KNX', 'Buspro', 'Zigbee'].includes(product.productType)
      ? product.productType
      : 'KNX';

    await prisma.productRequest.create({
      data: {
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        productType: validType,
        name,
        email,
        phone,
        message,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Order request submitted. We will contact you soon.',
    });
  } catch (error) {
    console.error('POST /api/product-requests:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to submit order request. Please try again.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
