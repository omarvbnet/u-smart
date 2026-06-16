/**
 * Per-element electrical declarations — the required voltage & current shown
 * on each component when placed on a floor plan / single-line.
 */
import type { CatalogEntry } from '../catalog';
import { loadCurrent, SQRT3 } from './electrical';

export type Declaration = { voltage: number; current: number; text: string };

export function declarationFor(entry: CatalogEntry): Declaration | null {
  switch (entry.domain) {
    case 'source': {
      const i = entry.phases === 3
        ? (entry.ratedKva * 1000) / (SQRT3 * entry.voltage)
        : (entry.ratedKva * 1000) / entry.voltage;
      return mk(entry.voltage, i);
    }
    case 'protection':
      if (entry.protectionType === 'SPD') return { voltage: 400, current: 0, text: '400V · SPD' };
      return mk(entry.poles >= 3 ? 400 : 230, entry.ratedCurrentA);
    case 'cable':
      if (entry.ampacityA <= 0) return { voltage: entry.voltageRating, current: 0, text: `${entry.voltageRating}V` };
      return mk(entry.voltageRating > 1000 ? entry.voltageRating : entry.voltageRating, entry.ampacityA);
    case 'load':
      return mk(entry.voltage, loadCurrent(entry.powerW, entry.voltage, entry.phases, entry.powerFactor));
    case 'hvac':
      return mk(entry.voltage, loadCurrent(entry.inputKw * 1000, entry.voltage, entry.phases, 0.9));
    case 'sensor':
      return { voltage: entry.voltage, current: entry.currentMa / 1000, text: `${entry.voltage}V · ${entry.currentMa}mA` };
    case 'smarthome': {
      if (entry.channelCurrentA) return mk(entry.voltage, entry.channelCurrentA * entry.channels);
      return { voltage: entry.voltage, current: entry.busCurrentMa / 1000, text: `${entry.voltage}V · ${entry.busCurrentMa}mA` };
    }
    default:
      return null;
  }
}

function mk(voltage: number, current: number): Declaration {
  return { voltage, current, text: `${voltage}V · ${current >= 10 ? current.toFixed(0) : current.toFixed(1)}A` };
}
