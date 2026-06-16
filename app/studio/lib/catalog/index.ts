import type { CatalogEntry, ComponentDomain, LocalizedText } from './types';
import { CABLES } from './cables';
import { PROTECTION } from './protection';
import { SOURCES, LOADS } from './sources';
import { HVAC } from './hvac';
import { SENSORS } from './sensors';
import { SMART_HOME } from './smarthome';

export * from './types';

export const CATALOG: CatalogEntry[] = [
  ...SOURCES,
  ...PROTECTION,
  ...CABLES,
  ...LOADS,
  ...HVAC,
  ...SENSORS,
  ...SMART_HOME,
];

const byId = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

export type PaletteGroup = {
  domain: ComponentDomain;
  label: LocalizedText;
  icon: string;
  entries: CatalogEntry[];
};

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    domain: 'source',
    icon: 'PlugZap',
    label: { ar: 'مصادر الطاقة', en: 'Power Sources', ku: 'سەرچاوەکانی وزە', tr: 'Güç Kaynakları' },
    entries: SOURCES,
  },
  {
    domain: 'protection',
    icon: 'ShieldCheck',
    label: { ar: 'أجهزة الحماية', en: 'Protection Devices', ku: 'ئامێرەکانی پاراستن', tr: 'Koruma Cihazları' },
    entries: PROTECTION,
  },
  {
    domain: 'cable',
    icon: 'Cable',
    label: { ar: 'الكابلات', en: 'Cables', ku: 'کێبڵەکان', tr: 'Kablolar' },
    entries: CABLES,
  },
  {
    domain: 'load',
    icon: 'Plug',
    label: { ar: 'الأحمال', en: 'Loads', ku: 'بارەکان', tr: 'Yükler' },
    entries: LOADS,
  },
  {
    domain: 'hvac',
    icon: 'AirVent',
    label: { ar: 'التكييف والتهوية', en: 'HVAC', ku: 'HVAC', tr: 'HVAC' },
    entries: HVAC,
  },
  {
    domain: 'sensor',
    icon: 'Radar',
    label: { ar: 'الحساسات', en: 'Sensors', ku: 'هەستەوەرەکان', tr: 'Sensörler' },
    entries: SENSORS,
  },
  {
    domain: 'smarthome',
    icon: 'House',
    label: { ar: 'المنزل الذكي', en: 'Smart Home', ku: 'ماڵی زیرەک', tr: 'Akıllı Ev' },
    entries: SMART_HOME,
  },
];
