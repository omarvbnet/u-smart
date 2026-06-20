/**
 * U Smart Studio — Project metadata & setup wizard configuration.
 * Travels with DesignFile (autosave, export, share).
 */
import type { LocalizedText, StandardCode } from './catalog';
import { defaultBedroomsForBuilding } from './engine/residential-layouts';

export type BuildingType =
  | 'house'
  | 'villa'
  | 'apartment'
  | 'residential'
  | 'commercial'
  | 'hotel'
  | 'hospital'
  | 'industrial';

export type SmartProtocol = 'HDL' | 'KNX' | 'BOTH';

export type HvacSystemType =
  | 'split'
  | 'multi_split'
  | 'vrf'
  | 'chiller'
  | 'fcu'
  | 'ahu'
  | 'package'
  | 'heat_pump';

export type EnergySourceType = 'grid' | 'generator' | 'solar' | 'battery' | 'ups';

/** How the floor plan was created: draw on blank canvas, import file, or none yet. */
export type FloorPlanSource = 'none' | 'zero' | 'import';

export type ProjectInfo = {
  client: string;
  consultant: string;
  location: string;
  reference: string;
  revision: string;
  buildingType: BuildingType;
  standards: StandardCode[];
  /** Setup wizard completed — when false, wizard is shown on workspace load. */
  setupComplete: boolean;
  smartBuilding: boolean;
  smartProtocol: SmartProtocol | null;
  hvacMode: 'auto' | 'manual';
  hvacTypes: HvacSystemType[];
  energySources: EnergySourceType[];
  floorPlanSource: FloorPlanSource;
  /** Bedroom count for residential layout templates (apartment / house / villa). */
  bedrooms: number;
};

export const BUILDING_TYPES: { id: BuildingType; label: LocalizedText }[] = [
  { id: 'house', label: { ar: 'منزل', en: 'House', ku: 'ماڵ', tr: 'Ev' } },
  { id: 'villa', label: { ar: 'فيلا', en: 'Villa', ku: 'ڤێلا', tr: 'Villa' } },
  { id: 'apartment', label: { ar: 'شقة', en: 'Apartment', ku: 'شوقە', tr: 'Daire' } },
  { id: 'residential', label: { ar: 'مبنى سكني', en: 'Residential Building', ku: 'بینای نیشتەجێبوون', tr: 'Konut Binası' } },
  { id: 'commercial', label: { ar: 'تجاري', en: 'Commercial', ku: 'بازرگانی', tr: 'Ticari' } },
  { id: 'hotel', label: { ar: 'فندق', en: 'Hotel', ku: 'هۆتێل', tr: 'Otel' } },
  { id: 'hospital', label: { ar: 'مستشفى', en: 'Hospital', ku: 'نەخۆشخانە', tr: 'Hastane' } },
  { id: 'industrial', label: { ar: 'صناعي', en: 'Industrial', ku: 'پیشەسازی', tr: 'Endüstriyel' } },
];

export const HVAC_OPTIONS: { id: HvacSystemType; label: LocalizedText }[] = [
  { id: 'split', label: { ar: 'سبليت', en: 'Split AC', ku: 'سپلیت', tr: 'Split' } },
  { id: 'multi_split', label: { ar: 'مالتي سبلیت', en: 'Multi Split', ku: 'مەلتی سپلیت', tr: 'Multi Split' } },
  { id: 'vrf', label: { ar: 'VRF', en: 'VRF', ku: 'VRF', tr: 'VRF' } },
  { id: 'chiller', label: { ar: 'تشيلر', en: 'Chiller', ku: 'چیلەر', tr: 'Chiller' } },
  { id: 'fcu', label: { ar: 'FCU', en: 'FCU', ku: 'FCU', tr: 'FCU' } },
  { id: 'ahu', label: { ar: 'AHU', en: 'AHU', ku: 'AHU', tr: 'AHU' } },
  { id: 'package', label: { ar: 'وحدة مركزية', en: 'Package Unit', ku: 'پاکێج', tr: 'Paket' } },
  { id: 'heat_pump', label: { ar: 'مضخة حرارية', en: 'Heat Pump', ku: 'پەمپی گەرمی', tr: 'Isı Pompası' } },
];

export const ENERGY_SOURCES: { id: EnergySourceType; label: LocalizedText }[] = [
  { id: 'grid', label: { ar: 'شبكة حكومية', en: 'Government Grid', ku: 'تۆڕی حکومی', tr: 'Şebeke' } },
  { id: 'generator', label: { ar: 'مولد', en: 'Generator', ku: 'جەنەراتۆر', tr: 'Jeneratör' } },
  { id: 'solar', label: { ar: 'طاقة شمسية', en: 'Solar PV', ku: 'خۆر', tr: 'Güneş' } },
  { id: 'battery', label: { ar: 'بطاريات', en: 'Batteries', ku: 'پاتری', tr: 'Batarya' } },
  { id: 'ups', label: { ar: 'UPS', en: 'UPS', ku: 'UPS', tr: 'UPS' } },
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
    setupComplete: false,
    smartBuilding: false,
    smartProtocol: null,
    hvacMode: 'auto',
    hvacTypes: ['split'],
    energySources: ['grid'],
    floorPlanSource: 'none',
    bedrooms: 4,
  };
}

export function buildingTypeLabel(type: BuildingType): LocalizedText {
  return BUILDING_TYPES.find((b) => b.id === type)?.label ?? BUILDING_TYPES[0]!.label;
}

/** Migrate older saved projects missing wizard fields. */
export function normalizeProject(p: Partial<ProjectInfo> | undefined): ProjectInfo {
  const d = defaultProject();
  if (!p) return d;
  return {
    ...d,
    ...p,
    standards: p.standards ?? d.standards,
    hvacTypes: p.hvacTypes ?? d.hvacTypes,
    energySources: p.energySources ?? d.energySources,
    setupComplete: p.setupComplete ?? (p.client ? true : false),
    floorPlanSource: p.floorPlanSource ?? d.floorPlanSource,
    bedrooms: p.bedrooms ?? defaultBedroomsForBuilding(p.buildingType ?? d.buildingType),
  };
}
