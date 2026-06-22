import type { DesignGarden, DesignRoom } from '../model';
import { PX_PER_M } from '../catalog/dimensions';

export type SpaceDimensions = {
  widthM: number;
  depthM: number;
  areaM2: number;
};

export function dimensionsFromPlanSize(widthPx: number, heightPx: number): SpaceDimensions {
  const widthM = widthPx / PX_PER_M;
  const depthM = heightPx / PX_PER_M;
  return {
    widthM,
    depthM,
    areaM2: widthM * depthM,
  };
}

export function roomDimensions(room: Pick<DesignRoom, 'width' | 'height'>): SpaceDimensions {
  return dimensionsFromPlanSize(room.width, room.height);
}

export function gardenDimensions(garden: Pick<DesignGarden, 'width' | 'height'>): SpaceDimensions {
  return dimensionsFromPlanSize(garden.width, garden.height);
}

export function formatMeters(m: number, digits = 2): string {
  return `${m.toFixed(digits)} m`;
}

/** e.g. 4.20 m × 3.60 m · 15.1 m² */
export function formatSpaceDimensions(d: SpaceDimensions, compact = false): string {
  const w = d.widthM.toFixed(2);
  const dep = d.depthM.toFixed(2);
  const area = d.areaM2.toFixed(1);
  if (compact) return `${w}×${dep} m · ${area} m²`;
  return `${w} m × ${dep} m · ${area} m²`;
}
