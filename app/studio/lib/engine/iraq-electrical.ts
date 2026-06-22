/**
 * Iraq electrical practice — 230 V / 50 Hz supply (Ministry of Electricity),
 * aligned with IEC 60364 / IEC 60898 adopted for Iraqi installations.
 */
import type { StandardCode } from '../catalog';
import type { DesignRoom } from '../model';
import type { ProjectInfo } from '../project';
import { selectBreakerRating } from './electrical';

export const IRAQ_SUPPLY = {
  voltage: 230,
  phases: 1 as const,
  frequencyHz: 50,
  powerFactor: 0.9,
} as const;

/** IEC 60364-5-52 voltage-drop limit for final circuits in Iraq LV installations. */
export const IRAQ_VD_LIMIT_PCT = 4;

const IEC_STANDARDS: StandardCode[] = ['IEC 60364', 'IEC 60898', 'IEC 60947', 'IEC 60287'];

export function roomAreaM2(room: DesignRoom): number {
  return (room.width / 50) * (room.height / 50);
}

/** Socket outlet count — Iraq residential spacing (~3 m perimeter) + zone minima. */
export function iraqSocketsForRoom(room: DesignRoom): number {
  const areaM2 = roomAreaM2(room);
  const perimeterM = (2 * (room.width + room.height)) / 50;
  switch (room.zone) {
    case 'kitchen':
      return Math.max(6, Math.ceil(perimeterM / 2.5));
    case 'bathroom':
      return Math.max(2, Math.ceil(areaM2 / 6));
    case 'bedroom':
      return Math.max(4, Math.ceil(perimeterM / 3));
    case 'office':
      return Math.max(5, Math.ceil(perimeterM / 3));
    case 'corridor':
      return Math.max(2, Math.ceil(perimeterM / 4));
    case 'mechanical':
      return 2;
    default:
      return Math.max(4, Math.ceil(perimeterM / 3));
  }
}

/** Ensure project standards include IEC set used in Iraq. */
export function withIraqElectricalStandards(project: ProjectInfo): ProjectInfo {
  const standards = [...new Set([...project.standards, ...IEC_STANDARDS])];
  const location =
    project.location && /iraq|العراق|عێراق|irak/i.test(project.location)
      ? project.location
      : project.location || 'Iraq';
  return { ...project, standards, location };
}

export function mcbCatalogIdForCurrent(designA: number, cableAmpacity = 999): string {
  const rating = selectBreakerRating(designA, cableAmpacity) ?? Math.min(63, Math.ceil(designA / 5) * 5);
  const clamped = Math.max(6, Math.min(63, rating));
  return `mcb-c${clamped}`;
}

export function cableCatalogIdForCurrent(designA: number): string {
  if (designA <= 10) return 'cable-lv-cu-1.5';
  if (designA <= 16) return 'cable-lv-cu-2.5';
  if (designA <= 25) return 'cable-lv-cu-4';
  if (designA <= 32) return 'cable-lv-cu-6';
  return 'cable-lv-cu-10';
}

export const IRAQ_DESIGN_ASSUMPTIONS = [
  '230 V / 50 Hz single-phase supply (Iraq utility).',
  'Socket spacing per IEC 60364 / Iraqi residential practice (~3 m).',
  'Lighting per EN 12464-1 maintained illuminance (adopted for Iraqi projects).',
  'Circuit protection IEC 60898 — Ib ≤ In ≤ Iz.',
];
