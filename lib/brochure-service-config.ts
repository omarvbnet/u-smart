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
  /** Optional: Index key for "Systems We Use" page (e.g. serviceTechnologies) */
  systemsPageKey?: string;
  /** Keys for systems to show (e.g. knx, buspro, zigbee) */
  systemsKeys?: string[];
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
    indexKey: 'smartHomeFeatures',
    featureKeys: ['security', 'lighting', 'control', 'luxury', 'powerSavings', 'climate'],
    systemsPageKey: 'serviceTechnologies',
    systemsKeys: ['knx', 'buspro', 'zigbee', 'electricalSolutions'],
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

export const BROCHURE_SERVICES_ORDER: { slug: string; brochureKey: string; icon: string }[] = [
  { slug: 'quality-control-supervision', brochureKey: 'serviceQuality', icon: 'ClipboardCheck' },
  { slug: 'smart-home-automation', brochureKey: 'serviceSmartHome', icon: 'Home' },
  { slug: 'enterprise-networking', brochureKey: 'serviceTelecom', icon: 'Network' },
  { slug: 'custom-software', brochureKey: 'serviceCleanEnergy', icon: 'Code2' },
];

/** Feature-specific image URLs – one per feature key (Unsplash – free to use) */
export const FEATURE_IMAGES: Record<string, string> = {
  inspection: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&q=80',
  supervision: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&q=80',
  hse: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&q=80',
  investigation: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&q=80',
  tracking: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80',
  fiber: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=400&q=80',
  cable_systemization: 'https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=400&q=80',
  closures: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&q=80',
  splice: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80',
  qgis: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=400&q=80',
  asbuilt_design: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=80',
  maintenance: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&q=80',
  security: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
  lighting: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400&q=80',
  control: 'https://images.unsplash.com/photo-1558002038-10559092d310?w=400&q=80',
  luxury: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80',
  powerSavings: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=80',
  climate: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&q=80',
  nodejs: 'https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=400&q=80',
  flutter: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&q=80',
  python: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=400&q=80',
  mysql: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=400&q=80',
  postgresql: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=400&q=80',
  nosql: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&q=80',
};

/** Service image URLs – one per service (Unsplash – free to use) */
export const SERVICE_IMAGES: Record<string, string> = {
  'quality-control-supervision':
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=900&q=85',
  'smart-home-automation':
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=85',
  'enterprise-networking':
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=900&q=85',
  'custom-software':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&q=85',
};

/** Icons for Why Choose strengths (7 items) */
export const WHY_CHOOSE_ICONS = ['Target', 'BarChart3', 'ShieldCheck', 'Zap', 'Home', 'Cable', 'Leaf'];

/** Icons for feature keys by service (fallback per key) */
export const FEATURE_ICONS: Record<string, string> = {
  inspection: 'Search',
  supervision: 'Eye',
  hse: 'Shield',
  investigation: 'FileSearch',
  tracking: 'TrendingUp',
  fiber: 'Cable',
  cable_systemization: 'LayoutList',
  closures: 'Box',
  splice: 'Link2',
  qgis: 'Map',
  asbuilt_design: 'PencilRuler',
  maintenance: 'Wrench',
  knx: 'Cpu',
  buspro: 'Radio',
  zigbee: 'Wifi',
  electricalSolutions: 'Zap',
  security: 'Shield',
  lighting: 'Lightbulb',
  control: 'PanelTop',
  luxury: 'Sparkles',
  powerSavings: 'Zap',
  climate: 'Thermometer',
  nodejs: 'Server',
  flutter: 'Smartphone',
  python: 'Terminal',
  mysql: 'Database',
  postgresql: 'Database',
  nosql: 'HardDrive',
};
