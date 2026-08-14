'use client';

import { Globe, Github, Smartphone, ExternalLink } from 'lucide-react';
import {
  linkDisplayLabel,
  resolveProjectLinks,
  type ProjectAppLink,
} from '@/lib/project-links';

function LinkIcon({ type }: { type: ProjectAppLink['type'] }) {
  switch (type) {
    case 'app_store':
    case 'google_play':
      return <Smartphone className="w-4 h-4 shrink-0" />;
    case 'github':
      return <Github className="w-4 h-4 shrink-0" />;
    case 'web':
      return <Globe className="w-4 h-4 shrink-0" />;
    default:
      return <ExternalLink className="w-4 h-4 shrink-0" />;
  }
}

function linkAccent(type: ProjectAppLink['type']): string {
  switch (type) {
    case 'app_store':
      return 'from-slate-700 to-slate-900 border-white/10 hover:border-white/25';
    case 'google_play':
      return 'from-emerald-900/80 to-teal-900/80 border-emerald-500/20 hover:border-emerald-400/40';
    case 'web':
      return 'from-blue-600/90 to-indigo-700/90 border-blue-400/30 hover:border-blue-300/50';
    case 'github':
      return 'from-zinc-800 to-zinc-950 border-white/10 hover:border-white/25';
    default:
      return 'from-violet-900/70 to-purple-900/70 border-violet-400/20 hover:border-violet-300/40';
  }
}

type Props = {
  project: {
    appLinks?: unknown;
    liveUrl?: string | null;
    githubUrl?: string | null;
  };
  size?: 'sm' | 'md';
  className?: string;
};

export function ProjectAppLinks({ project, size = 'md', className = '' }: Props) {
  const links = resolveProjectLinks(project);
  if (!links.length) return null;

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((link, i) => (
        <a
          key={`${link.url}-${i}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-xl font-medium text-white bg-gradient-to-br border shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl ${pad} ${linkAccent(link.type)}`}
        >
          <LinkIcon type={link.type} />
          <span>{linkDisplayLabel(link)}</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      ))}
    </div>
  );
}

/** Compact store badges for project cards. */
export function ProjectLinkBadges({ project }: { project: Props['project'] }) {
  const links = resolveProjectLinks(project);
  if (!links.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {links.slice(0, 4).map((link, i) => (
        <span
          key={`${link.url}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded-md bg-white/10 text-gray-300 border border-white/10"
        >
          <LinkIcon type={link.type} />
          {linkDisplayLabel(link)}
        </span>
      ))}
      {links.length > 4 && (
        <span className="px-2 py-0.5 text-[10px] text-gray-500">+{links.length - 4}</span>
      )}
    </div>
  );
}
