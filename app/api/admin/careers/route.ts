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
    const careers = await prisma.career.findMany({
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, careers });
  } catch (error) {
    console.error('GET /api/admin/careers:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch careers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : 'General';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const jobType = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'].includes(body.jobType)
      ? body.jobType
      : 'FULL_TIME';
    const experience = typeof body.experience === 'string' ? body.experience.trim() : '';
    const salaryRange = typeof body.salaryRange === 'string' ? body.salaryRange.trim() || null : null;
    const requirements = Array.isArray(body.requirements) ? body.requirements.filter((r: unknown) => typeof r === 'string') : [];
    const benefits = Array.isArray(body.benefits) ? body.benefits.filter((b: unknown) => typeof b === 'string') : [];
    const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : slugify(title);
    const featured = Boolean(body.featured);
    const remote = Boolean(body.remote);
    const translations = body.translations && typeof body.translations === 'object' ? body.translations : undefined;

    if (!title || !description) {
      return NextResponse.json({ success: false, message: 'Title and description are required' }, { status: 400 });
    }

    const career = await prisma.career.create({
      data: {
        title,
        slug,
        description,
        department,
        location,
        jobType,
        experience,
        salaryRange,
        requirements,
        benefits,
        featured,
        remote,
        ...(translations && Object.keys(translations).length > 0 ? { translations } : {}),
      },
    });

    return NextResponse.json({ success: true, career });
  } catch (error) {
    console.error('POST /api/admin/careers:', error);
    return NextResponse.json({ success: false, message: 'Failed to create career' }, { status: 500 });
  }
}
