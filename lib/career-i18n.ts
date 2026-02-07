import type { AppLocale } from './service-i18n';
import { isValidLocale } from './service-i18n';

const LOCALES = ['ar', 'en', 'ku', 'tr'] as const;

export type CareerTranslationEntry = {
  title?: string;
  description?: string;
  department?: string;
  location?: string;
};

export type CareerTranslations = Partial<Record<AppLocale, CareerTranslationEntry>>;

export function getLocalizedCareer(
  career: {
    title: string;
    description: string;
    department?: string;
    location?: string;
    translations?: unknown;
  },
  locale: string
): { title: string; description: string; department: string; location: string } {
  const t = (career.translations as CareerTranslations | null)?.[locale as AppLocale];
  return {
    title: t?.title ?? career.title,
    description: t?.description ?? career.description,
    department: t?.department ?? career.department ?? '',
    location: t?.location ?? career.location ?? '',
  };
}

export { isValidLocale };
export const CAREER_LOCALES: readonly string[] = LOCALES;
