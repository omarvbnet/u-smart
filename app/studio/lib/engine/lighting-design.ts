/**
 * Deterministic lighting design (EN 12464-1 target lux).
 */
import type { DesignRoom } from '../model';
import { LUX } from './lighting-design-shared';

export type RoomLightingDesign = {
  roomId: string;
  label: string;
  areaM2: number;
  luxTarget: number;
  lumensRequired: number;
  fixturesRecommended: number;
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
    'Target lux per EN 12464-1 typical maintained illuminance.',
    '800 lm / 12 W LED downlight assumed — replace with selected fixture datasheet.',
  ];

  const rows = rooms.map((r) => {
    const area = (r.width / 50) * (r.height / 50);
    const lux = LUX[r.zone];
    const lumens = (lux * area) / 0.8;
    const fixtures = Math.max(1, Math.ceil(lumens / 800));
    return {
      roomId: r.id,
      label: r.label,
      areaM2: Math.round(area * 10) / 10,
      luxTarget: lux,
      lumensRequired: Math.round(lumens),
      fixturesRecommended: fixtures,
      powerW: fixtures * 12,
    };
  });

  return {
    rooms: rows,
    totalPowerW: rows.reduce((s, r) => s + r.powerW, 0),
    totalFixtures: rows.reduce((s, r) => s + r.fixturesRecommended, 0),
    assumptions,
  };
}
