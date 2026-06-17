/**
 * U Smart Studio — Project metadata (Project Management module).
 * Stored inside the design file so it travels with exports, shares and autosave.
 */
import type { LocalizedText, StandardCode } from './catalog';

export type BuildingType =
  | 'villa'
  | 'residential'
  | 'commercial'
  | 'hotel'
  | 'hospital'
  | 'industrial';

export type ProjectInfo = {
  client: string;
  consultant: string;
  location: string;
  reference: string;
  revision: string;
  buildingType: BuildingType;
  standards: StandardCode[];
};

export const BUILDING_TYPES: { id: BuildingType; label: LocalizedText }[] = [
  { id: 'villa', label: { ar: 'فيلا', en: 'Villa', ku: 'ڤێلا', tr: 'Villa' } },
  { id: 'residential', label: { ar: 'سكني', en: 'Residential', ku: 'نیشتەجێبوون', tr: 'Konut' } },
  { id: 'commercial', label: { ar: 'تجاري', en: 'Commercial', ku: 'بازرگانی', tr: 'Ticari' } },
  { id: 'hotel', label: { ar: 'فندق', en: 'Hotel', ku: 'هۆتێل', tr: 'Otel' } },
  { id: 'hospital', label: { ar: 'مستشفى', en: 'Hospital', ku: 'نەخۆشخانە', tr: 'Hastane' } },
  { id: 'industrial', label: { ar: 'صناعي', en: 'Industrial', ku: 'پیشەسازی', tr: 'Endüstriyel' } },
];

export const ALL_STANDARDS: StandardCode[] = [
  'IEC 60364',
  'IEC 60947',
  'IEC 60898',
  'IEC 60287',
  'IEC 60332',
  'NEC 2023',
  'NFPA 70',
  'ASHRAE',
  'KNX',
];

export function defaultProject(): ProjectInfo {
  return {
    client: '',
    consultant: '',
    location: '',
    reference: '',
    revision: 'R0',
    buildingType: 'villa',
    standards: ['IEC 60364', 'IEC 60898', 'IEC 60947', 'NEC 2023'],
  };
}

export function buildingTypeLabel(type: BuildingType): LocalizedText {
  return BUILDING_TYPES.find((b) => b.id === type)?.label ?? BUILDING_TYPES[0]!.label;
}
