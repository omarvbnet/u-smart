import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedService, isValidLocale } from '@/lib/service-i18n';

export async function GET(req: NextRequest) {
  try {
    const locale = isValidLocale(req.nextUrl.searchParams.get('locale') || '') ? req.nextUrl.searchParams.get('locale')! : 'en';

    const services = await prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        content: true,
        icon: true,
        features: true,
        category: true,
        translations: true,
      },
    });

    let countBySlug: Record<string, number> = {};
    try {
      const trainingRows = await prisma.trainingRequest.findMany({
        select: { serviceSlug: true },
      });
      for (const row of trainingRows) {
        countBySlug[row.serviceSlug] = (countBySlug[row.serviceSlug] ?? 0) + 1;
      }
    } catch {
      // TrainingRequest table may not exist yet; use empty counts
    }

    const servicesWithCounts = services.map((s) => {
      const loc = getLocalizedService(s, locale);
      return {
        id: s.id,
        slug: s.slug,
        title: loc.title,
        description: loc.description,
        content: loc.content,
        icon: s.icon,
        features: loc.features,
        category: loc.category,
        trainingRequestCount: countBySlug[s.slug] ?? 0,
      };
    });

    return NextResponse.json({ success: true, services: servicesWithCounts });
  } catch (error) {
    console.error('GET /api/training/services:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch training services' },
      { status: 500 }
    );
  }
}
