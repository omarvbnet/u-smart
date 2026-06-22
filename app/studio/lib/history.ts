import type { DesignNode, DesignEdge, DesignRoom, BimModel, DesignFloor } from './model';
import { normalizeBim } from './model';
import type { ControlState } from './controls';

export const HISTORY_LIMIT = 35;

export type DesignHistorySnapshot = {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  rooms: DesignRoom[];
  bim: BimModel | null;
  floors: DesignFloor[];
  activeFloorId: string;
  designName: string;
};

function cloneParams(params: DesignNode['params']): DesignNode['params'] {
  const next: DesignNode['params'] = { ...params };
  if (typeof params.routePoints === 'string') next.routePoints = params.routePoints;
  return next;
}

export function cloneDesignSnapshot(s: {
  nodes: DesignNode[];
  edges: DesignEdge[];
  controls: Record<string, ControlState>;
  rooms: DesignRoom[];
  bim: BimModel | null;
  floors: DesignFloor[];
  activeFloorId: string;
  designName: string;
}): DesignHistorySnapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n, params: cloneParams(n.params) })),
    edges: s.edges.map((e) => ({ ...e })),
    controls: Object.fromEntries(
      Object.entries(s.controls).map(([k, v]) => [k, { ...v, channels: v.channels ? [...v.channels] : undefined }]),
    ),
    rooms: s.rooms.map((r) => ({ ...r })),
    bim: normalizeBim(s.bim),
    floors: s.floors.map((f) => ({ ...f })),
    activeFloorId: s.activeFloorId,
    designName: s.designName,
  };
}
