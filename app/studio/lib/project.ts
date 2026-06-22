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

/** How indoor HVAC units are distributed across rooms. */
export type HvacUnitMode = 'per_room' | 'fixed';

/** Smart actuator quality tier — drives default channel counts. */
export type SmartActuatorTier = 'standard' | 'premium' | 'hotel';

export type SmartChannelCounts = {
  relay: number;
  dimmer: number;
  curtain: number;
  dryContact: number;
};

/** How the floor plan was created: draw on blank canvas, import file, or none yet. */
export type FloorPlanSource = 'none' | 'zero' | 'import';

/** Manual = user places walls, doors, devices; no auto MEP or material suggestions. */
export type DesignMode = 'manual' | 'assisted';

export function isManualDesign(project: Pick<ProjectInfo, 'designMode'>): boolean {
  return project.designMode === 'manual';
}

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
  /** Primary cooling system (split, VRF, etc.). */
  coolingSystem: HvacSystemType;
  /** Primary heating system — often same as cooling for heat-pump / VRF. */
  heatingSystem: HvacSystemType;
  /** One indoor unit per room, or a fixed total count distributed across spaces. */
  hvacUnitMode: HvacUnitMode;
  /** Used when hvacUnitMode is `fixed`. */
  hvacUnitCount: number;
  /** Actuator quality tier for HDL / KNX channel planning. */
  smartActuatorTier: SmartActuatorTier;
  /** Planned smart output channels by actuator type. */
  smartChannels: SmartChannelCounts;
  /** Auto-map each channel to a load / opening in the design. */
  smartAlignChannels: boolean;
  energySources: EnergySourceType[];
  floorPlanSource: FloorPlanSource;
  /** Manual projects: empty canvas, user-driven layout and devices only. */
  designMode: DesignMode;
  /** Bedroom count for residential layout templates (apartment / house / villa). */
  bedrooms: number;
  /** Number of building floors — each gets its own plan view and MEP distribution. */
  floorCount: number;
  /** Solar PV array rated capacity (kW) for simulation & declarations. */
  solarCapacityKw: number;
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

export const SMART_ACTUATOR_TIERS: { id: SmartActuatorTier; label: LocalizedText; desc: LocalizedText }[] = [
  {
    id: 'standard',
    label: { ar: 'قياسي', en: 'Standard', ku: 'ستاندارد', tr: 'Standart' },
    desc: { ar: 'ريليه ودمر HDL أساسي', en: 'Basic HDL relay & dimmer modules', ku: 'ڕیلێ و دیمەری بنەڕەتی', tr: 'Temel HDL röle & dimmer' },
  },
  {
    id: 'premium',
    label: { ar: 'ممتاز', en: 'Premium', ku: 'پرێمیوم', tr: 'Premium' },
    desc: { ar: 'قنوات إضافية ومشغلات أقوى', en: 'Extra channels & higher-rated actuators', ku: 'کەناڵی زیاتر', tr: 'Ek kanallar' },
  },
  {
    id: 'hotel',
    label: { ar: 'فندقي', en: 'Hotel grade', ku: 'هۆتێل', tr: 'Otel sınıfı' },
    desc: { ar: 'لوحات فندقية ومشغلات كثيفة', en: 'Hotel panels & dense actuation', ku: 'پانێلی هۆتێل', tr: 'Otel panelleri' },
  },
];

export function defaultSmartChannels(tier: SmartActuatorTier, roomCount: number): SmartChannelCounts {
  const rooms = Math.max(3, roomCount);
  const mul = tier === 'hotel' ? 1.6 : tier === 'premium' ? 1.3 : 1;
  const base = Math.round(rooms * 2 * mul);
  return {
    relay: base,
    dimmer: Math.round(base * 0.65),
    curtain: Math.max(4, Math.round(rooms * mul)),
    dryContact: Math.max(4, Math.round(rooms * 0.9 * mul)),
  };
}

export function effectiveHvacTypes(project: ProjectInfo): HvacSystemType[] {
  const set = new Set<HvacSystemType>([project.coolingSystem, project.heatingSystem]);
  if (project.hvacMode === 'manual') project.hvacTypes.forEach((t) => set.add(t));
  return [...set];
}

export function primaryCoolingSystem(project: ProjectInfo): HvacSystemType {
  if (project.coolingSystem) return project.coolingSystem;
  if (project.hvacMode === 'auto') return 'split';
  return project.hvacTypes[0] ?? 'split';
}

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
    coolingSystem: 'vrf',
    heatingSystem: 'vrf',
    hvacUnitMode: 'per_room',
    hvacUnitCount: 4,
    smartActuatorTier: 'standard',
    smartChannels: defaultSmartChannels('standard', 4),
    smartAlignChannels: true,
    energySources: ['grid'],
    floorPlanSource: 'none',
    designMode: 'assisted',
    bedrooms: 4,
    floorCount: 2,
    solarCapacityKw: 30,
  };
}

export function buildingTypeLabel(type: BuildingType): LocalizedText {
  return BUILDING_TYPES.find((b) => b.id === type)?.label ?? BUILDING_TYPES[0]!.label;
}

/** Migrate older saved projects missing wizard fields. */
export function normalizeProject(p: Partial<ProjectInfo> | undefined): ProjectInfo {
  const d = defaultProject();
  if (!p) return d;
  const bedrooms = p.bedrooms ?? defaultBedroomsForBuilding(p.buildingType ?? d.buildingType);
  const cooling = p.coolingSystem ?? p.hvacTypes?.[0] ?? d.coolingSystem;
  const heating = p.heatingSystem ?? p.hvacTypes?.[0] ?? cooling;
  const tier = p.smartActuatorTier ?? d.smartActuatorTier;
  const floorCount = p.floorCount ?? d.floorCount;
  return {
    ...d,
    ...p,
    standards: p.standards ?? d.standards,
    hvacTypes: p.hvacTypes ?? [cooling, heating],
    coolingSystem: cooling,
    heatingSystem: heating,
    hvacUnitMode: p.hvacUnitMode ?? d.hvacUnitMode,
    hvacUnitCount: p.hvacUnitCount ?? bedrooms,
    smartActuatorTier: tier,
    smartChannels: p.smartChannels ?? defaultSmartChannels(tier, bedrooms * floorCount),
    smartAlignChannels: p.smartAlignChannels ?? true,
    energySources: p.energySources ?? d.energySources,
    setupComplete: p.setupComplete ?? (p.client ? true : false),
    floorPlanSource: p.floorPlanSource ?? d.floorPlanSource,
    designMode: p.designMode ?? (p.floorPlanSource === 'zero' ? 'manual' : d.designMode),
    bedrooms,
    floorCount,
    solarCapacityKw: p.solarCapacityKw ?? d.solarCapacityKw,
  };
}
