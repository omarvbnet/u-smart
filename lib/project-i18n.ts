const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
export type AppLocale = (typeof LOCALES)[number];

export type ProjectTranslations = Partial<
  Record<AppLocale, { title?: string; description?: string; content?: string }>
>;

export function getLocalizedProject(
  project: { title: string; description: string; content?: string | null; translations?: unknown },
  locale: string
): { title: string; description: string; content: string | null } {
  const t = (project.translations as ProjectTranslations | null)?.[
    locale as AppLocale
  ];
  return {
    title: t?.title ?? project.title,
    description: t?.description ?? project.description,
    content: t?.content ?? project.content ?? null,
  };
}

export function isValidLocaleProject(locale: string): locale is AppLocale {
  return LOCALES.includes(locale as AppLocale);
}
