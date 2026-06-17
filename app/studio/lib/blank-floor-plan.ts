/**
 * Procedural blank floor-plan canvas (grid + building outline) — no image import required.
 */
import type { BuildingType } from './project';

export type BlankFloorPlanSize = { width: number; height: number; gridM: number };

const SIZES: Record<BuildingType, BlankFloorPlanSize> = {
  house: { width: 1000, height: 800, gridM: 1 },
  villa: { width: 1200, height: 900, gridM: 1 },
  apartment: { width: 900, height: 700, gridM: 1 },
  residential: { width: 1400, height: 1000, gridM: 1 },
  commercial: { width: 1600, height: 1200, gridM: 2 },
  hotel: { width: 1800, height: 1400, gridM: 2 },
  hospital: { width: 2000, height: 1600, gridM: 2 },
  industrial: { width: 2400, height: 1800, gridM: 2 },
};

export function floorPlanSizeForBuilding(buildingType: BuildingType): BlankFloorPlanSize {
  return SIZES[buildingType] ?? SIZES.villa;
}

/** SVG data URL used as the map layer background (lightweight, no base64 photo). */
export function blankFloorPlanDataUrl(width: number, height: number, gridPx = 40): string {
  const lines: string[] = [];
  for (let x = 0; x <= width; x += gridPx) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" />`);
  }
  for (let y = 0; y <= height; y += gridPx) {
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" />`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f1f5f9"/>
  <g stroke="#cbd5e1" stroke-width="1">${lines.join('')}</g>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="10 6" rx="4"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#64748b">U Smart Studio — blank floor plan</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
