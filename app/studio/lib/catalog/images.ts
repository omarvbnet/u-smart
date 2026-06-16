import type { CatalogEntry } from './types';

const BASE = '/studio/devices';

/**
 * Maps a catalog entry to a photographic PNG asset. Returns null when no
 * dedicated image exists so the UI can fall back to a vector (Lucide) icon.
 */
export function imageForEntry(entry: CatalogEntry): string | null {
  switch (entry.domain) {
    case 'cable':
      return `${BASE}/cable.png`;
    case 'protection':
      return entry.protectionType === 'SPD' ? `${BASE}/spd.png` : `${BASE}/breaker.png`;
    case 'source':
      switch (entry.sourceType) {
        case 'UTILITY':
          return `${BASE}/utility.png`;
        case 'GENERATOR':
          return `${BASE}/generator.png`;
        case 'UPS':
        case 'BATTERY':
          return `${BASE}/ups.png`;
        case 'SOLAR_PV':
          return `${BASE}/solar.png`;
        case 'INVERTER':
          return `${BASE}/inverter.png`;
        case 'EV_CHARGER':
          return `${BASE}/ev.png`;
        default:
          return null; // wind → vector icon
      }
    case 'load':
      switch (entry.category) {
        case 'LIGHTING':
          return `${BASE}/light.png`;
        case 'SOCKET':
          return `${BASE}/socket.png`;
        case 'MOTOR':
          return `${BASE}/motor.png`;
        case 'PANEL':
          return `${BASE}/panel.png`;
        default:
          return null;
      }
    case 'hvac':
      return ['VRF', 'CHILLER', 'AHU', 'PACKAGE', 'HEAT_PUMP'].includes(entry.hvacType)
        ? `${BASE}/ac-outdoor.png`
        : `${BASE}/ac-indoor.png`;
    case 'sensor':
      return ['SMOKE', 'HEAT', 'GAS'].includes(entry.sensorType)
        ? `${BASE}/detector.png`
        : `${BASE}/sensor.png`;
    case 'smarthome':
      return /panel|touch|dlp|scene|hotel/i.test(entry.deviceClass)
        ? `${BASE}/touchpanel.png`
        : `${BASE}/module.png`;
    default:
      return null;
  }
}
