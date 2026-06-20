/** Shared EN 12464-1 target lux by zone — used by lighting design and heatmaps. */
import type { DesignRoom } from '../model';

export const LUX: Record<DesignRoom['zone'], number> = {
  general: 200,
  bedroom: 100,
  kitchen: 300,
  bathroom: 200,
  office: 500,
  corridor: 100,
  mechanical: 150,
};
