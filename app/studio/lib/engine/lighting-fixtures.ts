/**
 * Lighting fixture types — EN 12464-1 calculations per product class.
 */
import type { LightingFixtureType } from '../catalog/types';
import type { DesignRoom } from '../model';

export type FixtureSpec = {
  type: LightingFixtureType;
  catalogId: string;
  lumens: number;
  powerW: number;
  beamAngleDeg: number;
  lengthMm: number;
  spacingM: number;
  label: string;
};

export const FIXTURE_SPECS: Record<LightingFixtureType, FixtureSpec> = {
  DOWNLIGHT: {
    type: 'DOWNLIGHT',
    catalogId: 'load-downlight',
    lumens: 800,
    powerW: 12,
    beamAngleDeg: 60,
    lengthMm: 90,
    spacingM: 2.2,
    label: 'LED Downlight',
  },
  LINEAR: {
    type: 'LINEAR',
    catalogId: 'load-linear',
    lumens: 1200,
    powerW: 18,
    beamAngleDeg: 120,
    lengthMm: 1200,
    spacingM: 1.8,
    label: 'LED Linear',
  },
  SPOT: {
    type: 'SPOT',
    catalogId: 'load-spot',
    lumens: 600,
    powerW: 10,
    beamAngleDeg: 24,
    lengthMm: 80,
    spacingM: 2.5,
    label: 'LED Spot',
  },
  MAGNETIC: {
    type: 'MAGNETIC',
    catalogId: 'load-magnetic',
    lumens: 900,
    powerW: 14,
    beamAngleDeg: 45,
    lengthMm: 300,
    spacingM: 1.2,
    label: 'Magnetic Track',
  },
};

/** Recommend fixture type by room zone and ceiling context. */
export function recommendFixtureType(room: DesignRoom): LightingFixtureType {
  switch (room.zone) {
    case 'kitchen':
    case 'office':
      return 'LINEAR';
    case 'corridor':
      return 'MAGNETIC';
    case 'general':
      return room.width > 200 ? 'LINEAR' : 'DOWNLIGHT';
    case 'bedroom':
    case 'bathroom':
      return 'DOWNLIGHT';
    default:
      return 'SPOT';
  }
}

export function fixturesForRoom(lumensRequired: number, fixtureType: LightingFixtureType): number {
  const spec = FIXTURE_SPECS[fixtureType];
  return Math.max(1, Math.ceil(lumensRequired / spec.lumens));
}

export function achievedLux(areaM2: number, count: number, fixtureType: LightingFixtureType): number {
  if (areaM2 <= 0) return 0;
  const spec = FIXTURE_SPECS[fixtureType];
  const totalLumens = count * spec.lumens * 0.8;
  return Math.round(totalLumens / areaM2);
}

export function catalogIdForType(type: LightingFixtureType): string {
  return FIXTURE_SPECS[type].catalogId;
}
