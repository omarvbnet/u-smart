import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedCareer, isValidLocale } from '@/lib/career-i18n';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locale = isValidLocale(searchParams.get('locale') || '') ? searchParams.get('locale')! : 'en';

    const careers = await prisma.career.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });
    const localized = careers.map((c) => {
      const loc = getLocalizedCareer(c, locale);
      return {
        id: c.id,
        title: loc.title,
        slug: c.slug,
        description: loc.description,
        department: loc.department,
        location: loc.location,
        jobType: c.jobType,
      };
    });
    return NextResponse.json({ success: true, careers: localized });
  } catch (error) {
    console.error('GET /api/careers:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch careers' }, { status: 500 });
  }
}
