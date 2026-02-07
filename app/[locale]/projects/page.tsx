'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { ArrowLeft, FolderKanban } from 'lucide-react';

type Project = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  imageUrl: string | null;
  year?: number;
  client?: string | null;
  user?: { name: string | null } | null;
};

export default function ProjectsPage() {
  const t = useTranslations('Index');
  const locale = useLocale();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects?locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.projects) setProjects(data.projects);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locale]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('viewAll') || 'Back to Home'}
        </Link>

        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">{t('projects')}</h1>
          <p className="text-gray-400 text-lg">
            {t('hero.ctaPrimary') || 'View all our projects'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-16 text-center">
            <FolderKanban className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">{t('loading') || 'No projects yet.'}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={project.slug ? `/projects/${project.slug}` : '#'}
                  className="block rounded-2xl border border-white/10 bg-white/5 overflow-hidden hover:border-blue-500/30 hover:bg-white/10 transition-all group"
                >
                  {project.imageUrl && (
                    <div className="aspect-video overflow-hidden bg-white/5">
                      <img
                        src={project.imageUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-full">
                        {project.category}
                      </span>
                      {project.year && (
                        <span className="text-xs text-gray-500">{project.year}</span>
                      )}
                    </div>
                    <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                      {project.title}
                    </h2>
                    <p className="text-gray-400 text-sm line-clamp-2">{project.description}</p>
                    {(project.client || project.user?.name) && (
                      <p className="text-xs text-gray-500 mt-2">{project.client || project.user?.name}</p>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
