import type { CatalogEntry } from './catalog';
import type { DesignNode } from './model';
import type { VisualizationMode } from './visualization/modes';
import { footprintPx, physicalSpecFor } from './catalog/dimensions';

/** Pixels per metre on the floor plan for cable runs. */
export const CABLE_PX_PER_M = 3.2;

export function cableLengthPx(lengthM: number): number {
  return Math.min(280, Math.max(56, Math.round(lengthM * CABLE_PX_PER_M)));
}

export type NodeFootprint = {
  width: number;
  height: number;
  /** Drop / placement anchor — cursor lands here when placing on canvas. */
  anchorX: number;
  anchorY: number;
};

export function nodeFootprint(
  entry: CatalogEntry,
  params: DesignNode['params'] = {},
  visualizationMode: VisualizationMode = 'engineering',
): NodeFootprint {
  if (visualizationMode === 'product') {
    const fp = footprintPx(physicalSpecFor(entry));
    return { width: fp.w, height: fp.h, anchorX: Math.round(fp.w / 2), anchorY: Math.round(fp.h / 2) };
  }
  switch (entry.domain) {
    case 'cable': {
      const w = cableLengthPx(Number(params.lengthM ?? 20));
      return { width: w, height: 18, anchorX: 0, anchorY: 9 };
    }
    case 'protection':
      return { width: 44, height: 44, anchorX: 22, anchorY: 22 };
    case 'load':
      return { width: 42, height: 42, anchorX: 21, anchorY: 21 };
    case 'source':
      return { width: 76, height: 58, anchorX: 38, anchorY: 29 };
    case 'hvac':
      return { width: 92, height: 68, anchorX: 46, anchorY: 34 };
    case 'sensor':
    case 'smarthome':
      return { width: 38, height: 38, anchorX: 19, anchorY: 19 };
    default:
      return { width: 120, height: 72, anchorX: 60, anchorY: 36 };
  }
}

export function dropPosition(
  flowX: number,
  flowY: number,
  entry: CatalogEntry,
  params: DesignNode['params'] = {},
): { x: number; y: number } {
  const { anchorX, anchorY } = nodeFootprint(entry, params);
  return { x: flowX - anchorX, y: flowY - anchorY };
}

/** Angle in degrees from point A to B (for routing cables on the plan). */
export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

/** Nodes to include when fitting the viewport. */
export function nodesForCanvasFit(
  rfNodes: { id: string; type?: string }[],
  mode: 'content' | 'full',
): { id: string; type?: string }[] {
  if (mode === 'full') {
    return rfNodes.filter((n) => n.type === 'map' || n.type === 'room' || n.type === 'device' || n.type === 'cable');
  }
  return rfNodes.filter((n) => n.type === 'room' || n.type === 'device' || n.type === 'cable');
}

export function cableRunBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; lengthM: number; rotation: number } {
  const distPx = Math.hypot(bx - ax, by - ay);
  const lengthM = Math.max(6, Math.round(distPx / 50));
  return {
    x: ax,
    y: ay,
    lengthM,
    rotation: angleBetween(ax, ay, bx, by),
  };
}
