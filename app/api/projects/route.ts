import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedProject, isValidLocaleProject } from '@/lib/project-i18n';
import { notifySubscribers } from '@/lib/notify-subscribers';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const slug = searchParams.get('slug');
    const localeParam = searchParams.get('locale') || '';
    const list = await prisma.project.findMany({
      where: slug ? { slug: { equals: slug, mode: 'insensitive' } } : category ? { category } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });
    const projects =
      isValidLocaleProject(localeParam)
        ? list.map((p) => {
            const loc = getLocalizedProject(p, localeParam);
            return { ...p, title: loc.title, description: loc.description, content: loc.content };
          })
        : list;
    if (slug && projects.length === 1) {
      return NextResponse.json({ success: true, project: projects[0] });
    }
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error('GET /api/projects:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      return NextResponse.json({ success: false, message: 'No admin user found' }, { status: 400 });
    }
    const slug = body.slug || slugify(body.title || 'project');
    const translations =
      body.translations && typeof body.translations === 'object' && Object.keys(body.translations).length > 0
        ? body.translations
        : undefined;
    const project = await prisma.project.create({
      data: {
        title: body.title || 'Untitled',
        slug: body.slug || slug,
        description: body.description || '',
        content: body.content ?? null,
        translations: translations ?? undefined,
        category: body.category || 'General',
        tags: Array.isArray(body.tags) ? body.tags : [],
        technologies: Array.isArray(body.technologies) ? body.technologies : [],
        client: body.client ?? null,
        year: typeof body.year === 'number' ? body.year : new Date().getFullYear(),
        duration: body.duration ?? null,
        budget: body.budget ?? null,
        featured: Boolean(body.featured),
        status: body.status || 'COMPLETED',
        imageUrl: body.imageUrl ?? null,
        gallery: Array.isArray(body.gallery) ? body.gallery : [],
        liveUrl: body.liveUrl ?? null,
        githubUrl: body.githubUrl ?? null,
        userId: admin.id,
      },
    });
    notifySubscribers('project', project).catch((err) => console.error('Notify subscribers:', err));
    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('POST /api/projects:', error);
    return NextResponse.json({ success: false, message: 'Failed to create project' }, { status: 500 });
  }
}
