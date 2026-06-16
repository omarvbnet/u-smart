/**
 * U Smart Studio — Electrical calculation engine.
 *
 * Pure functions implementing the core sizing/analysis maths used by the
 * validation and auto-fix engines. References: IEC 60364-5-52 (ampacity &
 * voltage drop), IEC 60909 (short circuit, simplified).
 */
import type { CableSpec, ProtectionSpec, SourceSpec, LoadSpec, HvacSpec } from '../catalog';

export const SQRT3 = Math.sqrt(3);

/** Line current (A) for a given active power load. */
export function loadCurrent(powerW: number, voltage: number, phases: 1 | 3, pf: number): number {
  if (voltage <= 0 || pf <= 0) return 0;
  return phases === 3
    ? powerW / (SQRT3 * voltage * pf)
    : powerW / (voltage * pf);
}

/** Apparent power (kVA) from active power & PF. */
export function apparentKva(powerW: number, pf: number): number {
  if (pf <= 0) return 0;
  return powerW / pf / 1000;
}

/**
 * Voltage drop (volts) over a cable run.
 * ΔU = k · I · L · (R·cosφ + X·sinφ), k = √3 (3-ph) or 2 (1-ph).
 * Resistance/reactance provided in Ω/km, length in metres.
 */
export function voltageDrop(
  cable: Pick<CableSpec, 'resistanceOhmPerKm' | 'reactanceOhmPerKm'>,
  currentA: number,
  lengthM: number,
  phases: 1 | 3,
  pf: number,
): number {
  const k = phases === 3 ? SQRT3 : 2;
  const sinPhi = Math.sqrt(Math.max(0, 1 - pf * pf));
  const lengthKm = lengthM / 1000;
  return k * currentA * lengthKm * (cable.resistanceOhmPerKm * pf + cable.reactanceOhmPerKm * sinPhi);
}

/** Voltage drop expressed as a percentage of nominal voltage. */
export function voltageDropPercent(
  cable: Pick<CableSpec, 'resistanceOhmPerKm' | 'reactanceOhmPerKm'>,
  currentA: number,
  lengthM: number,
  voltage: number,
  phases: 1 | 3,
  pf: number,
): number {
  if (voltage <= 0) return 0;
  return (voltageDrop(cable, currentA, lengthM, phases, pf) / voltage) * 100;
}

/**
 * Smallest cable (by ampacity) from a candidate list that carries `currentA`
 * with the requested derating margin and stays within the voltage-drop limit.
 */
export function selectCable(
  candidates: CableSpec[],
  currentA: number,
  lengthM: number,
  voltage: number,
  phases: 1 | 3,
  pf: number,
  opts: { vdLimitPct?: number; material?: CableSpec['conductorMaterial'] } = {},
): CableSpec | null {
  const vdLimit = opts.vdLimitPct ?? 4;
  const pool = candidates
    .filter((c) => c.category === 'LV' && c.ampacityA > 0)
    .filter((c) => (opts.material ? c.conductorMaterial === opts.material : true))
    .sort((a, b) => a.csaMm2 - b.csaMm2);
  for (const c of pool) {
    if (c.ampacityA < currentA) continue;
    const vd = voltageDropPercent(c, currentA, lengthM, voltage, phases, pf);
    if (vd <= vdLimit) return c;
  }
  return pool.length ? (pool[pool.length - 1] ?? null) : null;
}

/**
 * Standard protective-device rating that satisfies IB ≤ In ≤ Iz
 * (design current ≤ device rating ≤ cable ampacity). Returns the smallest
 * standard rating ≥ design current.
 */
export const STANDARD_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 400, 630] as const;

export function selectBreakerRating(designCurrentA: number, cableAmpacityA: number): number | null {
  for (const r of STANDARD_RATINGS) {
    if (r >= designCurrentA && r <= cableAmpacityA) return r;
  }
  return null;
}

/** Whether a protective device correctly protects a cable: In ≤ Iz. */
export function breakerProtectsCable(breaker: ProtectionSpec, cable: CableSpec): boolean {
  return breaker.ratedCurrentA <= cable.ampacityA;
}

/** Total connected apparent power of a set of sources (kVA). */
export function totalSourceKva(sources: SourceSpec[]): number {
  return sources.reduce((sum, s) => sum + s.ratedKva, 0);
}

/** Total prospective short-circuit current (kA) — sum of source contributions. */
export function prospectiveScKa(sources: SourceSpec[]): number {
  return sources.reduce((sum, s) => sum + s.scContributionKA, 0);
}

/**
 * Diversified demand of a group of loads (W) applying each load's demand
 * factor, then a group diversity factor.
 */
export function diversifiedDemandW(loads: LoadSpec[], diversity = 1): number {
  const sum = loads.reduce((s, l) => s + l.powerW * l.demandFactor, 0);
  return sum * diversity;
}

/** Annual energy consumption (kWh) for an HVAC unit given equivalent full-load hours. */
export function hvacAnnualKwh(unit: HvacSpec, fullLoadHours = 1200): number {
  return unit.inputKw * fullLoadHours;
}

/** Cooling load in BTU/h from kW. */
export function kwToBtu(kw: number): number {
  return kw * 3412.142;
}
