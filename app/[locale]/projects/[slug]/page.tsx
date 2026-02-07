'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowLeft } from 'lucide-react';

type Project = {
  id: string;
  title: string;
  slug: string;
  description: string;
  content: string | null;
  category: string;
  imageUrl: string | null;
  gallery: string[];
  technologies: string[];
  year?: number;
  duration?: string | null;
  budget?: string | null;
  liveUrl?: string | null;
  githubUrl?: string | null;
  client?: string | null;
};

export default function ProjectDetailPage() {
  const t = useTranslations('Index');
  const locale = useLocale();
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/projects?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.project) setProject(data.project);
        else setError('Project not found');
      })
      .catch(() => setError('Failed to load project'))
      .finally(() => setLoading(false));
  }, [slug, locale]);

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        {loading ? (
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="text-center">
            <p className="text-gray-400 mb-6">{error ?? 'Project not found'}</p>
            <Link href="/projects" className="text-blue-400 hover:text-blue-300">
              ← Back to Projects
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('projects')}
        </Link>

        {project.imageUrl && (
          <div className="aspect-video rounded-2xl overflow-hidden mb-8 bg-white/5">
            <img src={project.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-3 py-1 text-sm font-medium bg-blue-500/10 text-blue-400 rounded-full">
            {project.category}
          </span>
          {project.year && (
            <span className="px-3 py-1 text-sm text-gray-400 rounded-full bg-white/5">
              {project.year}
            </span>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold mb-6">{project.title}</h1>
        <p className="text-gray-400 text-lg leading-relaxed mb-8">{project.description}</p>

        {project.content && (
          <div
            className="prose prose-invert prose-lg max-w-none mb-8"
            dangerouslySetInnerHTML={{ __html: project.content }}
          />
        )}

        {project.technologies && project.technologies.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Technologies</h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 text-sm bg-white/5 rounded-lg border border-white/10"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {project.liveUrl && (
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-sm transition-colors"
            >
              View Live
            </a>
          )}
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-white/20 hover:bg-white/5 rounded-lg font-medium text-sm transition-colors"
            >
              GitHub
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
