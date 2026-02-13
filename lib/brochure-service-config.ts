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
  /** Gradient start for cover/headers */
  gradientFrom: string;
  /** Gradient end */
  gradientTo: string;
  /** Light tint for light pages */
  pageTint: string;
  /** Secondary accent (darker) */
  accentDark: string;
};

const defaultPalette = {
  accent: '#1e40af',
  accentLight: '#3b82f6',
  accentDark: '#1e3a8a',
  accentBg: 'rgba(59, 130, 246, 0.12)',
  gradientFrom: '#1e40af',
  gradientTo: '#3b82f6',
  pageTint: 'rgba(59, 130, 246, 0.06)',
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
    accentBg: 'rgba(245, 158, 11, 0.15)',
    gradientFrom: '#78350f',
    gradientTo: '#f59e0b',
    pageTint: 'rgba(245, 158, 11, 0.08)',
  },
  'enterprise-networking': {
    indexKey: 'enterpriseNetworkingTechnologies',
    featureKeys: ['fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design', 'maintenance'],
    aboutTitleKey: 'telecommunicationTitle',
    aboutDescKey: 'telecommunicationDescription',
    accent: '#0e7490',
    accentLight: '#06b6d4',
    accentDark: '#0c4a6e',
    accentBg: 'rgba(6, 182, 212, 0.15)',
    gradientFrom: '#0e7490',
    gradientTo: '#22d3ee',
    pageTint: 'rgba(6, 182, 212, 0.08)',
  },
  'smart-home-automation': {
    indexKey: 'serviceTechnologies',
    featureKeys: ['knx', 'buspro', 'zigbee'],
    aboutTitleKey: 'smartHomesTitle',
    aboutDescKey: 'smartHomesDescription',
    accent: '#1d4ed8',
    accentLight: '#3b82f6',
    accentDark: '#1e3a8a',
    accentBg: 'rgba(59, 130, 246, 0.15)',
    gradientFrom: '#1e40af',
    gradientTo: '#60a5fa',
    pageTint: 'rgba(59, 130, 246, 0.08)',
  },
  'custom-software': {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentDark: '#065f46',
    accentBg: 'rgba(16, 185, 129, 0.15)',
    gradientFrom: '#064e3b',
    gradientTo: '#34d399',
    pageTint: 'rgba(16, 185, 129, 0.08)',
  },
  programming: {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentDark: '#065f46',
    accentBg: 'rgba(16, 185, 129, 0.15)',
    gradientFrom: '#064e3b',
    gradientTo: '#34d399',
    pageTint: 'rgba(16, 185, 129, 0.08)',
  },
};

/** Default palette when no service selected */
export function getDefaultBrochureConfig(): BrochureServiceConfig {
  return {
    indexKey: '',
    featureKeys: [],
    aboutTitleKey: '',
    aboutDescKey: '',
    ...defaultPalette,
    accentDark: defaultPalette.accentDark,
    gradientFrom: defaultPalette.gradientFrom,
    gradientTo: defaultPalette.gradientTo,
    pageTint: defaultPalette.pageTint,
  };
}

export const BROCHURE_SERVICES_ORDER: { slug: string; brochureKey: string }[] = [
  { slug: 'quality-control-supervision', brochureKey: 'serviceQuality' },
  { slug: 'smart-home-automation', brochureKey: 'serviceSmartHome' },
  { slug: 'enterprise-networking', brochureKey: 'serviceTelecom' },
  { slug: 'custom-software', brochureKey: 'serviceCleanEnergy' },
];
