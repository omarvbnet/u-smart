import type { CatalogEntry } from './types';

/** Physical installation data used for product view and placement checks. */
export type PhysicalSpec = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  clearanceFrontMm: number;
  clearanceSideMm: number;
  mount: 'wall' | 'floor' | 'ceiling' | 'panel' | 'duct' | 'inline';
  datasheetUrl?: string;
  listPriceUsd?: number;
};

const DEFAULT: PhysicalSpec = {
  widthMm: 86,
  heightMm: 86,
  depthMm: 40,
  clearanceFrontMm: 100,
  clearanceSideMm: 50,
  mount: 'wall',
};

/** Plan scale: 50 canvas px ≈ 1 m. */
export const PX_PER_M = 50;

export function physicalSpecFor(entry: CatalogEntry): PhysicalSpec {
  switch (entry.domain) {
    case 'load':
      if (entry.category === 'LIGHTING')
        return { widthMm: 120, heightMm: 120, depthMm: 80, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'ceiling', listPriceUsd: 45 };
      if (entry.category === 'SOCKET')
        return { widthMm: 86, heightMm: 86, depthMm: 35, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'wall', listPriceUsd: 12 };
      if (entry.category === 'PANEL')
        return { widthMm: 600, heightMm: 800, depthMm: 200, clearanceFrontMm: 800, clearanceSideMm: 200, mount: 'panel', listPriceUsd: 850 };
      if (entry.category === 'MOTOR')
        return { widthMm: 400, heightMm: 300, depthMm: 400, clearanceFrontMm: 600, clearanceSideMm: 300, mount: 'floor', listPriceUsd: 1200 };
      return DEFAULT;
    case 'protection':
      if (entry.protectionType === 'MCB' || entry.protectionType === 'RCBO')
        return { widthMm: 18, heightMm: 90, depthMm: 70, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'panel', listPriceUsd: 18 };
      if (entry.protectionType === 'MCCB' || entry.protectionType === 'ACB')
        return { widthMm: 130, heightMm: 200, depthMm: 120, clearanceFrontMm: 300, clearanceSideMm: 100, mount: 'panel', listPriceUsd: 420 };
      return { widthMm: 36, heightMm: 90, depthMm: 70, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'panel', listPriceUsd: 35 };
    case 'source':
      if (entry.sourceType === 'GENERATOR')
        return { widthMm: 2200, heightMm: 1400, depthMm: 900, clearanceFrontMm: 1200, clearanceSideMm: 800, mount: 'floor', listPriceUsd: 18000 };
      return { widthMm: 500, heightMm: 700, depthMm: 250, clearanceFrontMm: 800, clearanceSideMm: 300, mount: 'panel', listPriceUsd: 2500 };
    case 'hvac':
      if (entry.hvacType === 'SPLIT' || entry.hvacType === 'VRF')
        return { widthMm: 900, heightMm: 320, depthMm: 220, clearanceFrontMm: 600, clearanceSideMm: 300, mount: 'wall', listPriceUsd: 680 };
      if (entry.hvacType === 'CHILLER')
        return { widthMm: 2400, heightMm: 1800, depthMm: 1200, clearanceFrontMm: 1500, clearanceSideMm: 800, mount: 'floor', listPriceUsd: 42000 };
      return { widthMm: 600, heightMm: 600, depthMm: 600, clearanceFrontMm: 500, clearanceSideMm: 300, mount: 'ceiling', listPriceUsd: 1200 };
    case 'sensor':
      if (entry.sensorType === 'MOTION' || entry.sensorType === 'PRESENCE')
        return { widthMm: 90, heightMm: 90, depthMm: 45, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'ceiling', listPriceUsd: 85 };
      return { widthMm: 100, heightMm: 100, depthMm: 40, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'ceiling', listPriceUsd: 55 };
    case 'smarthome': {
      const dc = entry.deviceClass.toLowerCase();
      if (dc.includes('touch') || dc.includes('panel'))
        return { widthMm: 120, heightMm: 120, depthMm: 15, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'wall', listPriceUsd: 320 };
      if (dc.includes('curtain'))
        return { widthMm: 70, heightMm: 110, depthMm: 55, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'panel', listPriceUsd: 95 };
      return { widthMm: 72, heightMm: 90, depthMm: 65, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'panel', listPriceUsd: 110 };
    }
    case 'cable':
      return { widthMm: 12, heightMm: 12, depthMm: 12, clearanceFrontMm: 0, clearanceSideMm: 0, mount: 'inline', listPriceUsd: entry.costPerMeter };
    default:
      return DEFAULT;
  }
}

export function footprintPx(spec: PhysicalSpec): { w: number; h: number } {
  return { w: Math.max(28, Math.round((spec.widthMm / 1000) * PX_PER_M)), h: Math.max(28, Math.round((spec.heightMm / 1000) * PX_PER_M)) };
}
