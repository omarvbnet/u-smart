/**
 * U Smart Studio — Design model.
 *
 * Framework-agnostic representation of a Digital Twin design. The Zustand
 * store and the React Flow canvas both project from these structures.
 */
import type { CatalogEntry } from './catalog';

/** A placed component instance on the canvas. */
export type DesignNode = {
  id: string;
  catalogId: string;
  label: string;
  x: number;
  y: number;
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
};

export type Design = {
  id: string;
  name: string;
  nodes: DesignNode[];
  edges: DesignEdge[];
  rooms?: DesignRoom[];
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
