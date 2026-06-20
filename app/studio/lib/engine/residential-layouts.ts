/**
 * Residential floor-plan templates — apartment, house, and villa layouts.
 */
import type { DesignRoom } from '../model';
import type { BuildingType } from '../project';
import type { StudioLocale } from '../i18n';

export const RESIDENTIAL_BUILDING_TYPES: BuildingType[] = ['apartment', 'house', 'villa'];

export function isResidentialBuilding(bt: BuildingType): boolean {
  return RESIDENTIAL_BUILDING_TYPES.includes(bt);
}

export function defaultBedroomsForBuilding(bt: BuildingType): number {
  if (bt === 'apartment') return 2;
  if (bt === 'house') return 3;
  if (bt === 'villa') return 4;
  return 3;
}

export function bedroomRangeForBuilding(bt: BuildingType): { min: number; max: number } {
  if (bt === 'apartment') return { min: 1, max: 3 };
  if (bt === 'house') return { min: 2, max: 5 };
  if (bt === 'villa') return { min: 3, max: 6 };
  return { min: 1, max: 4 };
}

export function layoutSummary(bt: BuildingType, bedrooms: number, locale: StudioLocale): string {
  const labels: Record<BuildingType, Record<StudioLocale, string>> = {
    apartment: {
      ar: `شقة — ${bedrooms} غرف نوم، صالة مفتوحة، مطبخ، حمام`,
      en: `Apartment — ${bedrooms} bed, open living, kitchen, bath`,
      ku: `شوقە — ${bedrooms} ژووری نوستن، نیشتەجێبوون، چێشتخانە`,
      tr: `Daire — ${bedrooms} yatak odası, açık salon, mutfak, banyo`,
    },
    house: {
      ar: `منزل — ${bedrooms} غرف، صالة، مطبخ، حمامين، مرآب`,
      en: `House — ${bedrooms} beds, living, dining, kitchen, 2 baths, garage`,
      ku: `ماڵ — ${bedrooms} ژوور، نیشتەجێبوون، چێشتخانە، ٢ حەمام`,
      tr: `Ev — ${bedrooms} oda, salon, yemek, mutfak, 2 banyo, garaj`,
    },
    villa: {
      ar: `فيلا — ${bedrooms} غرف، صالة كبيرة، جناح رئيسي، تراس، غرفة MEP`,
      en: `Villa — ${bedrooms} beds, grand living, master suite, terrace, MEP`,
      ku: `ڤێلا — ${bedrooms} ژوور، نیشتەجێبوونی گەورە، سویت، تراس`,
      tr: `Villa — ${bedrooms} oda, geniş salon, master suit, teras, MEP`,
    },
    residential: { ar: '', en: '', ku: '', tr: '' },
    commercial: { ar: '', en: '', ku: '', tr: '' },
    hotel: { ar: '', en: '', ku: '', tr: '' },
    hospital: { ar: '', en: '', ku: '', tr: '' },
    industrial: { ar: '', en: '', ku: '', tr: '' },
  };
  return labels[bt][locale] ?? labels[bt].en;
}

function clampBedrooms(bt: BuildingType, n: number): number {
  const { min, max } = bedroomRangeForBuilding(bt);
  return Math.min(max, Math.max(min, Math.round(n)));
}

function mk(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zone: DesignRoom['zone'],
): DesignRoom {
  return { id, label, x, y, width, height, zone };
}

/** Compact open-plan apartment (~75–110 m² feel). */
function apartmentLayout(bedrooms: number): DesignRoom[] {
  const beds = clampBedrooms('apartment', bedrooms);
  const rooms: DesignRoom[] = [
    mk('room_living', 'Living / Dining', -300, -170, 340, 220, 'general'),
    mk('room_kitchen', 'Kitchen', 60, -170, 200, 150, 'kitchen'),
    mk('room_corr', 'Corridor', -300, 60, 560, 48, 'corridor'),
    mk('room_bath', 'Bathroom', 60, 120, 130, 110, 'bathroom'),
    mk('room_balcony', 'Balcony', 210, 120, 150, 90, 'general'),
  ];
  const bedW = 170;
  const bedH = 150;
  let x = -300;
  for (let i = 0; i < beds; i++) {
    rooms.push(mk(`room_bed_${i + 1}`, beds === 1 ? 'Bedroom' : `Bedroom ${i + 1}`, x, 120, bedW, bedH, 'bedroom'));
    x += bedW + 16;
  }
  return rooms;
}

/** Detached house — living wing + bedroom wing + garage. */
function houseLayout(bedrooms: number): DesignRoom[] {
  const beds = clampBedrooms('house', bedrooms);
  const rooms: DesignRoom[] = [
    mk('room_living', 'Living Room', -340, -190, 300, 210, 'general'),
    mk('room_dining', 'Dining', -20, -190, 170, 140, 'general'),
    mk('room_kitchen', 'Kitchen', 170, -190, 200, 170, 'kitchen'),
    mk('room_corr', 'Hallway', -340, 30, 510, 44, 'corridor'),
    mk('room_bath1', 'Bathroom', -340, 200, 130, 100, 'bathroom'),
    mk('room_bath2', 'Ensuite', 170, 200, 110, 90, 'bathroom'),
    mk('room_garage', 'Garage / MEP', 300, -190, 170, 280, 'mechanical'),
  ];
  const bedW = 165;
  const bedH = 155;
  let x = -200;
  for (let i = 0; i < beds; i++) {
    const label = i === 0 && beds > 1 ? 'Master Bedroom' : beds === 1 ? 'Bedroom' : `Bedroom ${i + 1}`;
    rooms.push(mk(`room_bed_${i + 1}`, label, x, 90, bedW, bedH, 'bedroom'));
    x += bedW + 14;
  }
  return rooms;
}

/** Large villa — dual wing layout with terrace and MEP closet. */
function villaLayout(bedrooms: number): DesignRoom[] {
  const beds = clampBedrooms('villa', bedrooms);
  const rooms: DesignRoom[] = [
    mk('room_living', 'Grand Living', -420, -220, 380, 250, 'general'),
    mk('room_dining', 'Dining', -420, 50, 220, 150, 'general'),
    mk('room_kitchen', 'Kitchen', -170, -220, 240, 200, 'kitchen'),
    mk('room_master', 'Master Suite', 90, -220, 240, 210, 'bedroom'),
    mk('room_master_bath', 'Master Bath', 90, 10, 140, 110, 'bathroom'),
    mk('room_corr', 'Gallery', -420, 220, 450, 50, 'corridor'),
    mk('room_guest_bath', 'Guest Bath', 250, 220, 130, 100, 'bathroom'),
    mk('room_mep', 'MEP / Plant', 400, -220, 140, 160, 'mechanical'),
    mk('room_terrace', 'Terrace', 400, -40, 140, 150, 'general'),
  ];
  const extraBeds = Math.max(0, beds - 1);
  const bedW = 175;
  const bedH = 160;
  let x = -420;
  for (let i = 0; i < extraBeds; i++) {
    rooms.push(mk(`room_bed_${i + 2}`, `Bedroom ${i + 2}`, x, 290, bedW, bedH, 'bedroom'));
    x += bedW + 16;
  }
  return rooms;
}

function commercialLayout(): DesignRoom[] {
  return [
    mk('room_lobby', 'Lobby', -260, -160, 340, 180, 'general'),
    mk('room_office', 'Office', 100, -160, 220, 180, 'office'),
    mk('room_mech', 'MEP', -260, 40, 160, 140, 'mechanical'),
  ];
}

export function buildResidentialRooms(bt: BuildingType, bedrooms?: number): DesignRoom[] {
  const count = clampBedrooms(bt, bedrooms ?? defaultBedroomsForBuilding(bt));
  if (bt === 'apartment') return apartmentLayout(count);
  if (bt === 'house') return houseLayout(count);
  if (bt === 'villa') return villaLayout(count);
  return houseLayout(count);
}

export function seedRoomsForBuilding(bt: BuildingType, bedrooms?: number): DesignRoom[] {
  if (isResidentialBuilding(bt)) return buildResidentialRooms(bt, bedrooms);
  return commercialLayout();
}

/** Suggested garden bounds for villa terrace (flow coords). */
export function villaGardenBounds(): { x: number; y: number; width: number; height: number } {
  return { x: 380, y: 60, width: 200, height: 180 };
}
