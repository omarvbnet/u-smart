/** Allowed ingress-protection options for clean-energy quote requests (stored + emailed). */
export const CLEAN_ENERGY_IP_KEYS = ['ip65', 'ip21', 'ip66', 'ip54'] as const;
export type CleanEnergyIpKey = (typeof CLEAN_ENERGY_IP_KEYS)[number];

export const CLEAN_ENERGY_IP_LABELS: Record<CleanEnergyIpKey, string> = {
  ip65: 'IP 65',
  ip21: 'IP 21',
  ip66: 'IP 66',
  ip54: 'IP 54',
};

export function isCleanEnergyIpKey(v: string): v is CleanEnergyIpKey {
  return (CLEAN_ENERGY_IP_KEYS as readonly string[]).includes(v);
}

export type CleanEnergyDesignSnapshot = {
  runtimeHours: number;
  usageCurrentA: number;
  inverterPowerW: number | null;
  efficiency: number;
  safetyFactor: number;
  energyConsumedKwh: number;
  batteryKwh: number;
  batterySafeKwh: number;
  solarPanels615W: number;
  totalSolarKw: number;
  chargeTimeHours: number;
  minInverterW: number;
  inverterSafeW: number;
  maxCurrentA: number;
  safeCurrentA: number;
  estimatedPriceUsd: number;
};

const VOLTAGE = 220;
const SAFETY_MARGIN = 1.2;
const PANEL_W = 0.615;
const SUN_HOURS = 5.5;
const PANEL_EFFICIENCY = 0.75;
const CHARGE_EFFICIENCY = 0.85;

/** Same formulas as the Clean Energy service calculator; returns null if inputs invalid. */
export function computeCleanEnergySnapshot(
  designForm: { runtimeHours: string; usageCurrent: string; inverterPower: string; efficiency: string; safety: string },
  pricePerWattCents: number
): CleanEnergyDesignSnapshot | null {
  const runtimeHours = parseFloat(designForm.runtimeHours);
  const usageCurrent = parseFloat(designForm.usageCurrent);
  const inverterPower = parseFloat(designForm.inverterPower);
  const efficiency = parseFloat(designForm.efficiency) || 0.9;
  const safety = parseFloat(designForm.safety) || 0.8;
  const valid = !isNaN(runtimeHours) && runtimeHours > 0 && !isNaN(usageCurrent) && usageCurrent > 0;
  if (!valid) return null;

  const energyConsumed = (VOLTAGE * usageCurrent * runtimeHours) / 1000;
  const energyKwh = energyConsumed / (efficiency * safety);
  const minInverterW = VOLTAGE * usageCurrent;
  const inverterSafeW = Math.ceil((minInverterW * SAFETY_MARGIN) / 100) * 100;
  const inverterPowerOrRecommended = !isNaN(inverterPower) && inverterPower > 0 ? inverterPower : inverterSafeW;
  const maxCurrent = inverterPowerOrRecommended / VOLTAGE;
  const safeCurrent = maxCurrent * 0.7;
  const panelEnergy = PANEL_W * SUN_HOURS;
  const requiredPanels = Math.ceil(energyKwh / (panelEnergy * PANEL_EFFICIENCY));
  const totalSolarPower = requiredPanels * PANEL_W;
  const chargeTime = totalSolarPower > 0 ? energyKwh / (totalSolarPower * CHARGE_EFFICIENCY) : 0;
  const batterySafeKwh = energyKwh * SAFETY_MARGIN;
  const cents = typeof pricePerWattCents === 'number' && pricePerWattCents > 0 ? pricePerWattCents : 50;
  const estimatedPriceUsd = totalSolarPower * 1000 * (cents / 100);

  return {
    runtimeHours,
    usageCurrentA: usageCurrent,
    inverterPowerW: !isNaN(inverterPower) && inverterPower > 0 ? inverterPower : null,
    efficiency,
    safetyFactor: safety,
    energyConsumedKwh: energyConsumed,
    batteryKwh: energyKwh,
    batterySafeKwh,
    solarPanels615W: requiredPanels,
    totalSolarKw: totalSolarPower,
    chargeTimeHours: chargeTime,
    minInverterW,
    inverterSafeW,
    maxCurrentA: maxCurrent,
    safeCurrentA: safeCurrent,
    estimatedPriceUsd,
  };
}

export const CLEAN_ENERGY_CALC_VOLTAGE = VOLTAGE;
