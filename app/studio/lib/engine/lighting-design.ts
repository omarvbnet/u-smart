/**
 * Deterministic lighting design (EN 12464-1) with fixture-type selection.
 */
import type { DesignRoom } from '../model';
import type { LightingFixtureType } from '../catalog/types';
import { LUX } from './lighting-design-shared';
import {
  FIXTURE_SPECS,
  recommendFixtureType,
  fixturesForRoom,
  achievedLux,
} from './lighting-fixtures';
import { IRAQ_DESIGN_ASSUMPTIONS } from './iraq-electrical';

export type RoomLightingDesign = {
  roomId: string;
  label: string;
  areaM2: number;
  luxTarget: number;
  lumensRequired: number;
  fixturesRecommended: number;
  fixtureType: LightingFixtureType;
  catalogId: string;
  achievedLux: number;
  compliant: boolean;
  powerW: number;
};

export type LightingDesignReport = {
  rooms: RoomLightingDesign[];
  totalPowerW: number;
  totalFixtures: number;
  assumptions: string[];
};

export function calculateLightingDesign(rooms: DesignRoom[]): LightingDesignReport {
  const assumptions = [
    ...IRAQ_DESIGN_ASSUMPTIONS,
    'Target lux per EN 12464-1 maintained illuminance.',
    'Fixture types: downlight, linear, spot, magnetic track — datasheet values used for calculations.',
    'Maintenance factor 0.8 applied to lumen output.',
  ];

  const rows = rooms.map((r) => {
    const area = (r.width / 50) * (r.height / 50);
    const lux = LUX[r.zone];
    const lumens = (lux * area) / 0.8;
    const fixtureType = recommendFixtureType(r);
    const spec = FIXTURE_SPECS[fixtureType];
    const fixtures = fixturesForRoom(lumens, fixtureType);
    const achieved = achievedLux(area, fixtures, fixtureType);
    return {
      roomId: r.id,
      label: r.label,
      areaM2: Math.round(area * 10) / 10,
      luxTarget: lux,
      lumensRequired: Math.round(lumens),
      fixturesRecommended: fixtures,
      fixtureType,
      catalogId: spec.catalogId,
      achievedLux: achieved,
      compliant: achieved >= lux * 0.9,
      powerW: fixtures * spec.powerW,
    };
  });

  return {
    rooms: rows,
    totalPowerW: rows.reduce((s, r) => s + r.powerW, 0),
    totalFixtures: rows.reduce((s, r) => s + r.fixturesRecommended, 0),
    assumptions,
  };
}
