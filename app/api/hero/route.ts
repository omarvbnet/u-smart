import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocalizedService, isValidLocale } from '@/lib/service-i18n';
import { getLocalizedProject } from '@/lib/project-i18n';
import { getLocalizedCareer } from '@/lib/career-i18n';

export async function GET(req: NextRequest) {
  try {
    await prisma.$connect();
    const { searchParams } = new URL(req.url);
    const locale = isValidLocale(searchParams.get('locale') || '') ? searchParams.get('locale')! : 'en';

    const [statistics, featuredProjects, services, clients, careers] = await Promise.all([
      prisma.statistic.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        take: 4,
      }),
      prisma.project.findMany({
        where: { featured: true },
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true } },
        },
      }),
      prisma.service.findMany({
        where: { featured: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.client.findMany({
        where: { featured: true },
        take: 8,
      }),
      (async () => {
        try {
          return await prisma.career.findMany({
            where: { status: 'OPEN' },
            orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
            take: 8,
            select: {
              id: true,
              title: true,
              slug: true,
              description: true,
              department: true,
              location: true,
              jobType: true,
              translations: true,
            },
          });
        } catch {
          return [];
        }
      })(),
    ]);

    const totalProjects = await prisma.project.count();
    const totalClients = await prisma.client.count();

    const stats =
      statistics.length > 0
        ? statistics
        : [
            { key: 'projects', value: totalProjects || 150, label: 'مشروع مكتمل', suffix: '+', icon: '📁', isActive: true, order: 1, id: '', createdAt: new Date(), updatedAt: new Date() },
            { key: 'clients', value: totalClients || 85, label: 'عميل راضٍ', suffix: '+', icon: '👥', isActive: true, order: 2, id: '', createdAt: new Date(), updatedAt: new Date() },
            { key: 'uptime', value: 5, label: 'سنة خبرة', suffix: '+', icon: '⏱️', isActive: true, order: 3, id: '', createdAt: new Date(), updatedAt: new Date() },
            { key: 'countries', value: 12, label: 'دولة', suffix: '+', icon: '🌍', isActive: true, order: 4, id: '', createdAt: new Date(), updatedAt: new Date() },
          ].map((s, i) => ({ ...s, id: `fallback-${i}` }));

    return NextResponse.json({
      statistics: stats,
      featuredProjects: featuredProjects.map((p) => {
        const loc = getLocalizedProject(p, locale);
        return {
          id: p.id,
          slug: p.slug,
          title: loc.title,
          description: loc.description,
          category: p.category,
          imageUrl: p.imageUrl,
          featured: p.featured,
          status: p.status,
          client: p.user ? { name: p.user.name, logo: null } : null,
        };
      }),
      solutions: services.map((s) => {
        const loc = getLocalizedService(s, locale);
        return {
          id: s.id,
          slug: s.slug,
          title: loc.title,
          description: loc.description,
          icon: s.icon,
          color: 'blue',
          link: `/services/${s.slug}`,
          isActive: true,
          order: 0,
        };
      }),
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        logo: c.logo,
        industry: c.industry,
        country: null,
      })),
      careers: careers.map((c) => {
        const loc = getLocalizedCareer(c, locale);
        return {
          id: c.id,
          title: loc.title,
          slug: c.slug,
          description: loc.description,
          department: loc.department,
          location: loc.location,
          type: c.jobType,
        };
      }),
      totalProjects,
      totalClients,
      success: true,
      message: 'Data loaded successfully',
    });
  } catch (error) {
    console.error('❌ Error in /api/hero:', error);
    return NextResponse.json(
      {
        statistics: [
          { id: '1', key: 'projects', value: 150, label: 'مشروع مكتمل', suffix: '+', icon: '📁', isActive: true, order: 1 },
          { id: '2', key: 'clients', value: 85, label: 'عميل راضٍ', suffix: '+', icon: '👥', isActive: true, order: 2 },
          { id: '3', key: 'uptime', value: 5, label: 'سنة خبرة', suffix: '+', icon: '⏱️', isActive: true, order: 3 },
          { id: '4', key: 'countries', value: 12, label: 'دولة', suffix: '+', icon: '🌍', isActive: true, order: 4 },
        ],
        featuredProjects: [],
        solutions: [],
        clients: [],
        careers: [],
        totalProjects: 0,
        totalClients: 0,
        success: true,
        message: 'Using fallback data due to error',
      },
      { status: 200 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
