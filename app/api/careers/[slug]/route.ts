import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedCareer, isValidLocale } from '@/lib/career-i18n';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const locale = isValidLocale(searchParams.get('locale') || '') ? searchParams.get('locale')! : 'en';

    const slugVal = (slug ?? '').trim().toLowerCase();
    const career = await prisma.career.findFirst({
      where: {
        slug: { equals: slugVal, mode: 'insensitive' },
        status: 'OPEN',
      },
    });
    if (!career) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }
    const loc = getLocalizedCareer(career, locale);
    return NextResponse.json({
      success: true,
      career: {
        ...career,
        title: loc.title,
        description: loc.description,
        department: loc.department,
        location: loc.location,
      },
    });
  } catch (error) {
    console.error('GET /api/careers/[slug]:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch career' }, { status: 500 });
  }
}
