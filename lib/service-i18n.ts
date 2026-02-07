const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;
export type AppLocale = (typeof LOCALES)[number];

export type ServiceTranslationEntry = {
  title?: string;
  description?: string;
  content?: string;
  features?: string[];
  priceRange?: string;
  duration?: string;
  category?: string;
};

export type ServiceTranslations = Partial<Record<AppLocale, ServiceTranslationEntry>>;

export function getLocalizedService(
  service: {
    title: string;
    description: string;
    content?: string | null;
    features?: string[];
    priceRange?: string | null;
    duration?: string | null;
    category?: string;
    translations?: unknown;
  },
  locale: string
): {
  title: string;
  description: string;
  content: string | null;
  features: string[];
  priceRange: string | null;
  duration: string | null;
  category: string;
} {
  const t = (service.translations as ServiceTranslations | null)?.[locale as AppLocale];
  return {
    title: t?.title ?? service.title,
    description: t?.description ?? service.description,
    content: t?.content ?? service.content ?? null,
    features: Array.isArray(t?.features) && t.features.length > 0
      ? t.features
      : service.features ?? [],
    priceRange: t?.priceRange ?? service.priceRange ?? null,
    duration: t?.duration ?? service.duration ?? null,
    category: t?.category ?? service.category ?? '',
  };
}

export function isValidLocale(locale: string): locale is AppLocale {
  return LOCALES.includes(locale as AppLocale);
}
