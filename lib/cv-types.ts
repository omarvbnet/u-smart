export type CVExperience = {
  id: string;
  jobTitle: string;
  company: string;
  dateFrom: string;
  dateTo: string;
  current: boolean;
  description: string;
};

export type CVEducation = {
  id: string;
  degree: string;
  school: string;
  dateFrom: string;
  dateTo: string;
  description?: string;
};

export type CVData = {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experience: CVExperience[];
  education: CVEducation[];
  skills: string;
  languages: string;
  certifications: string;
};

export const defaultCVData: CVData = {
  fullName: '',
  jobTitle: '',
  email: '',
  phone: '',
  location: '',
  website: '',
  summary: '',
  experience: [],
  education: [],
  skills: '',
  languages: '',
  certifications: '',
};

export type CVTemplateId = 'modern' | 'classic' | 'minimal';

/** Locales that use RTL and Arabic script for proper CV rendering */
export function isRtlLocale(locale: string): boolean {
  return locale === 'ar' || locale === 'ku';
}

export const ARABIC_FONT =
  "'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', 'Arabic Typesetting', Tahoma, Arial, sans-serif";
