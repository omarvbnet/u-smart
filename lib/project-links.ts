/** App / web store links attached to a programming project. */
export type ProjectLinkType = 'app_store' | 'google_play' | 'web' | 'github' | 'custom';

export type ProjectAppLink = {
  type: ProjectLinkType;
  label?: string;
  url: string;
};

export const PROJECT_LINK_PRESETS: { type: ProjectLinkType; label: string; placeholder: string }[] = [
  { type: 'app_store', label: 'App Store', placeholder: 'https://apps.apple.com/app/...' },
  { type: 'google_play', label: 'Google Play', placeholder: 'https://play.google.com/store/apps/details?id=...' },
  { type: 'web', label: 'Web App', placeholder: 'https://yourapp.com' },
  { type: 'github', label: 'GitHub', placeholder: 'https://github.com/org/repo' },
  { type: 'custom', label: 'Custom link', placeholder: 'https://...' },
];

export function parseAppLinks(raw: unknown): ProjectAppLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ProjectAppLink => {
      if (!item || typeof item !== 'object') return false;
      const o = item as Record<string, unknown>;
      return typeof o.url === 'string' && o.url.trim().length > 0;
    })
    .map((item) => ({
      type: (['app_store', 'google_play', 'web', 'github', 'custom'].includes(item.type)
        ? item.type
        : 'custom') as ProjectLinkType,
      label: item.label?.trim() || undefined,
      url: item.url.trim(),
    }));
}

export function linkDisplayLabel(link: ProjectAppLink): string {
  if (link.label?.trim()) return link.label.trim();
  const preset = PROJECT_LINK_PRESETS.find((p) => p.type === link.type);
  return preset?.label ?? 'Link';
}

/** Merge legacy liveUrl/githubUrl into appLinks for display. */
export function resolveProjectLinks(project: {
  appLinks?: unknown;
  liveUrl?: string | null;
  githubUrl?: string | null;
}): ProjectAppLink[] {
  const links = parseAppLinks(project.appLinks);
  const seen = new Set(links.map((l) => l.url));
  if (project.liveUrl?.trim() && !seen.has(project.liveUrl.trim())) {
    links.unshift({ type: 'web', label: 'Web App', url: project.liveUrl.trim() });
    seen.add(project.liveUrl.trim());
  }
  if (project.githubUrl?.trim() && !seen.has(project.githubUrl.trim())) {
    links.push({ type: 'github', label: 'GitHub', url: project.githubUrl.trim() });
  }
  return links;
}

/** Derive legacy URL fields from appLinks when saving. */
export function legacyUrlsFromAppLinks(links: ProjectAppLink[]): {
  liveUrl: string | null;
  githubUrl: string | null;
} {
  const web = links.find((l) => l.type === 'web');
  const github = links.find((l) => l.type === 'github');
  return {
    liveUrl: web?.url ?? null,
    githubUrl: github?.url ?? null,
  };
}

export function sanitizeAppLinksForSave(links: ProjectAppLink[]): ProjectAppLink[] {
  return links
    .map((l) => ({
      type: l.type,
      label: l.label?.trim() || undefined,
      url: l.url.trim(),
    }))
    .filter((l) => l.url.length > 0);
}
