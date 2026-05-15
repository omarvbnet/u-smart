/**
 * Helpers for BULK / length-unit materials (meters, etc.) where quantity on an
 * item row is consumable in parts and should roll up across multiple assigned lines.
 */

export function unitMeasuresLength(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase();
  return (
    u === 'm' ||
    u === 'meter' ||
    u === 'meters' ||
    u === 'metre' ||
    u === 'metres' ||
    u === 'lm' ||
    u === 'linear m' ||
    u === 'linear meter' ||
    u === 'linear meters'
  );
}

export function materialSupportsPartialConsumption(args: {
  tracking: string | null | undefined;
  unit: string | null | undefined;
}): boolean {
  const tr = String(args.tracking ?? 'SERIAL').toUpperCase();
  if (tr === 'BULK') return true;
  return unitMeasuresLength(args.unit);
}

export function formatQuantityWithUnit(quantity: number, unit: string | null | undefined): string {
  const u = unit?.trim();
  if (u) return `${quantity} ${u}`;
  return `${quantity}`;
}
