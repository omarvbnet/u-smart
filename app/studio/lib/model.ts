/**
 * U Smart Studio — Design model.
 *
 * Framework-agnostic representation of a Digital Twin design. The Zustand
 * store and the React Flow canvas both project from these structures.
 */
import type { CatalogEntry } from './catalog';

/** A room zone on the floor plan (drawn from zero or AI-detected). */
export type DesignRoom = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Zone classification for load / HVAC rules. */
  zone: 'general' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'corridor' | 'mechanical';
  floorId?: string;
};

/** A placed component instance on the canvas. */
export type DesignNode = {
  id: string;
  catalogId: string;
  label: string;
  x: number;
  y: number;
  floorId?: string;
  /**
   * Instance overrides. For cables this includes `lengthM`; runtime simulation
   * state (energised, current, etc.) is stored under `runtime`.
   */
  params: Record<string, number | string | boolean>;
};

/** A connection between two component ports. */
export type DesignEdge = {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  /** Resolved catalog entry of the cable used for this run, if any. */
  cableId?: string;
};

/** Wall segment extracted from CAD or raster analysis. */
export type DesignWall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  layer?: string;
  floorId?: string;
};

/** Curtain style for smart windows. */
export type CurtainStyle = 'none' | 'roll' | 'single' | 'double';

/** Door or window opening on the plan. */
export type DesignOpening = {
  id: string;
  kind: 'door' | 'window';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  layer?: string;
  floorId?: string;
  roomId?: string;
  linkedNodeId?: string;
  smartEnabled?: boolean;
  curtainStyle?: CurtainStyle;
  /** 0 = closed, 100 = fully open (door swing / curtain travel). */
  openPercent?: number;
};

/** Outdoor garden / landscape zone on the plan. */
export type DesignGarden = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  floorId?: string;
};

/** Floor level in a multi-storey building. */
export type DesignFloor = {
  id: string;
  label: string;
  level: number;
  elevationM: number;
};

/** Structured BIM-like geometry from plan analysis. */
export type BimModel = {
  walls: DesignWall[];
  openings: DesignOpening[];
  gardens?: DesignGarden[];
};

export type Design = {
  id: string;
  name: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms?: DesignRoom[];
  bim?: BimModel;
  floors?: DesignFloor[];
  activeFloorId?: string;
};

export type ResolvedNode = DesignNode & { spec: CatalogEntry };

export function resolveNodes(
  nodes: DesignNode[],
  getEntry: (id: string) => CatalogEntry | undefined,
): ResolvedNode[] {
  const out: ResolvedNode[] = [];
  for (const n of nodes) {
    const spec = getEntry(n.catalogId);
    if (spec) out.push({ ...n, spec });
  }
  return out;
}
