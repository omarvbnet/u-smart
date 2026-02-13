/**
 * Maps service slugs to brochure content: Index translation keys for features/technologies,
 * About keys for title/description, and accent color for design.
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
};

export const BROCHURE_SERVICE_CONFIG: Record<string, BrochureServiceConfig> = {
  'quality-control-supervision': {
    indexKey: 'qualityControlTechnologies',
    featureKeys: ['inspection', 'supervision', 'hse', 'investigation', 'tracking'],
    aboutTitleKey: 'qualityTitle',
    aboutDescKey: 'qualityDescription',
    accent: '#b45309',
    accentLight: '#f59e0b',
    accentBg: 'rgba(245, 158, 11, 0.08)',
  },
  'enterprise-networking': {
    indexKey: 'enterpriseNetworkingTechnologies',
    featureKeys: ['fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design', 'maintenance'],
    aboutTitleKey: 'telecommunicationTitle',
    aboutDescKey: 'telecommunicationDescription',
    accent: '#0e7490',
    accentLight: '#06b6d4',
    accentBg: 'rgba(6, 182, 212, 0.08)',
  },
  'smart-home-automation': {
    indexKey: 'serviceTechnologies',
    featureKeys: ['knx', 'buspro', 'zigbee'],
    aboutTitleKey: 'smartHomesTitle',
    aboutDescKey: 'smartHomesDescription',
    accent: '#1d4ed8',
    accentLight: '#3b82f6',
    accentBg: 'rgba(59, 130, 246, 0.08)',
  },
  'custom-software': {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.08)',
  },
  programming: {
    indexKey: 'programmingTechnologies',
    featureKeys: ['nodejs', 'flutter', 'python', 'mysql', 'postgresql', 'nosql'],
    aboutTitleKey: 'programmingTitle',
    aboutDescKey: 'programmingDescription',
    accent: '#047857',
    accentLight: '#10b981',
    accentBg: 'rgba(16, 185, 129, 0.08)',
  },
};

export const BROCHURE_SERVICES_ORDER: { slug: string; brochureKey: string }[] = [
  { slug: 'quality-control-supervision', brochureKey: 'serviceQuality' },
  { slug: 'smart-home-automation', brochureKey: 'serviceSmartHome' },
  { slug: 'enterprise-networking', brochureKey: 'serviceTelecom' },
  { slug: 'custom-software', brochureKey: 'serviceCleanEnergy' },
];
