'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowLeft } from 'lucide-react';
import { ProjectAppLinks } from '@/components/projects/ProjectAppLinks';
import { ProjectGallery, ProjectImagePlaceholder } from '@/components/projects/ProjectGallery';

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
  appLinks?: unknown;
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

  const allImages = [project.imageUrl, ...(project.gallery ?? [])].filter(Boolean) as string[];
  const galleryOnly = (project.gallery ?? []).filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 md:pt-14 md:pb-12">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('projects')}
          </Link>

          <div className="flex flex-wrap gap-2 mb-5">
            <span className="px-3 py-1 text-sm font-medium bg-blue-500/15 text-blue-300 rounded-full border border-blue-500/20">
              {project.category}
            </span>
            {project.year && (
              <span className="px-3 py-1 text-sm text-gray-400 rounded-full bg-white/5 border border-white/10">
                {project.year}
              </span>
            )}
            {project.client && (
              <span className="px-3 py-1 text-sm text-gray-400 rounded-full bg-white/5 border border-white/10">
                {project.client}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">{project.title}</h1>
          <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-3xl">{project.description}</p>

          <div className="mt-8">
            <ProjectAppLinks project={project} />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14 space-y-12">
        {/* Cover */}
        {project.imageUrl ? (
          <div className="aspect-video rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl shadow-black/40">
            <img src={project.imageUrl} alt={project.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <ProjectImagePlaceholder title={project.title} />
        )}

        {project.content && (
          <div
            className="prose prose-invert prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: project.content }}
          />
        )}

        {project.technologies && project.technologies.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Technologies</h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1.5 text-sm bg-white/5 rounded-xl border border-white/10 text-gray-300"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {galleryOnly.length > 0 && (
          <ProjectGallery images={galleryOnly} title="Screenshots & Gallery" />
        )}

        {allImages.length > 1 && galleryOnly.length === 0 && (
          <ProjectGallery images={allImages.slice(1)} title="More Images" />
        )}

        <div className="pt-6 border-t border-white/10">
          <ProjectAppLinks project={project} />
        </div>
      </div>
    </div>
  );
}
