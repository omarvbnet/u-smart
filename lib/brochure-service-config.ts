/**
 * Maps service slugs to brochure content: Index translation keys for features/technologies,
 * About keys for title/description, and full design palette per service.
 */

export type ServiceSlug =
  | 'quality-control-supervision'
  | 'enterprise-networking'
  | 'smart-home-automation'
  | 'custom-software'
  | 'programming';

export type BrochureServiceConfig = {
  indexKey: string;
  featureKeys: string[];
  aboutTitleKey: string;
  aboutDescKey: string;
  accent: string;
  accentLight: string;
  accentBg: string;
  accentDark: string;
  /** Solid dark background for cover */
  coverBg: string;
  /** Solid light background for content pages */
  pageBg: string;
  /** Secondary light background for alternate boxes */
  boxBg: string;
};

const defaultPalette = {
  accent: '#1e40af',
  accentLight: '#3b82f6',
  accentDark: '#1e3a8a',
  accentBg: 'rgba(59, 130, 246, 0.12)',
  coverBg: '#0f172a',
  pageBg: '#f8fafc',
  boxBg: '#ffffff',
};

export const BROCHURE_SERVICE_CONFIG: Record<string, BrochureServiceConfig> = {
  'quality-control-supervision': {
    indexKey: 'qualityControlTechnologies',
    featureKeys: ['inspection', 'supervision', 'hse', 'investigation', 'tracking'],
    aboutTitleKey: 'qualityTitle',
    aboutDescKey: 'qualityDescription',
    accent: '#b45309',
    accentLight: '#f59e0b',
    accentDark: '#92400e',
    accentBg: 'rgba(245, 158, 11, 0.12)',
    coverBg: '#1c1917',
    pageBg: '#fffbeb',
    boxBg: '#ffffff',
  },
  'enterprise-networking': {
    indexKey: 'enterpriseNetworkingTechnologies',
    featureKeys: ['fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design', 'maintenance'],
    aboutTitleKey: 'telecommunicationTitle',
    aboutDescKey: 'telecommunicationDescription',
    accent: '#0e7490',
    accentLight: '#06b6d4',
    accentDark: '#0c4a6e',
    accentBg: 'rgba(6, 182, 212, 0.12)',
    coverBg: '#0c4a6e',
    pageBg: '#ecfeff',
    boxBg: '#ffffff',
  },
  'smart-home-automation': {
    indexKey: 'serviceTechnologies',
    featureKeys: ['knx', 'buspro', 'zigbee'],
    aboutTitleKey: 'smartHomesTitle',
    aboutDescKey: 'smartHomesDescription',
    accent: '#1d4ed8',
    accentLight: '#3b82f6',
    accentDark: '#1e3a8a',
    accentBg: 'rgba(59, 130, 246, 0.12)',
    coverBg: '#0f172a',
    pageBg: '#eff6ff',
    boxBg: '#ffffff',
  },
  'custom-software': {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentDark: '#065f46',
    accentBg: 'rgba(16, 185, 129, 0.12)',
    coverBg: '#064e3b',
    pageBg: '#ecfdf5',
    boxBg: '#ffffff',
  },
  programming: {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentDark: '#065f46',
    accentBg: 'rgba(16, 185, 129, 0.12)',
    coverBg: '#064e3b',
    pageBg: '#ecfdf5',
    boxBg: '#ffffff',
  },
};

export const BROCHURE_SERVICES_ORDER: { slug: string; brochureKey: string }[] = [
  { slug: 'quality-control-supervision', brochureKey: 'serviceQuality' },
  { slug: 'smart-home-automation', brochureKey: 'serviceSmartHome' },
  { slug: 'enterprise-networking', brochureKey: 'serviceTelecom' },
  { slug: 'custom-software', brochureKey: 'serviceCleanEnergy' },
];
