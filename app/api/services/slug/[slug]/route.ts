import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedService, isValidLocale } from '@/lib/service-i18n';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const locale = isValidLocale(searchParams.get('locale') || '') ? searchParams.get('locale')! : 'en';

    // Normalize slug: lowercase for consistent lookup (Quality-Control-Supervision -> quality-control-supervision)
    const normalizedSlug = slug?.toLowerCase().trim() || '';

    let service = await prisma.service.findUnique({
      where: { slug: normalizedSlug },
      include: { user: { select: { name: true, email: true } } },
    });
    // Fallback: try exact slug if normalized didn't match (for backwards compatibility)
    if (!service && slug && slug !== normalizedSlug) {
      service = await prisma.service.findUnique({
        where: { slug },
        include: { user: { select: { name: true, email: true } } },
      });
    }
    if (!service) {
      return NextResponse.json({ success: false, message: 'Service not found' }, { status: 404 });
    }
    const loc = getLocalizedService(service, locale);
    return NextResponse.json({
      success: true,
      service: {
        ...service,
        title: loc.title,
        description: loc.description,
        content: loc.content,
        features: loc.features,
        priceRange: loc.priceRange,
        duration: loc.duration,
        category: loc.category,
      },
    });
  } catch (error) {
    console.error('GET /api/services/slug/[slug]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch service' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
