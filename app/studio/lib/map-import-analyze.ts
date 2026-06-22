/**
 * Extract rooms + BIM geometry from an imported plan only — no synthetic engineering layout.
 */
import type { BimModel, DesignRoom } from './model';
import { detectRoomsFromMap as detectRooms, detectBimFromMap } from './engine/plan-detect';
import { snapOpeningsToWalls } from './engine/wall-layout';
import { yieldToMain } from './idle';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export type MapAnalyzeInput = {
  src: string;
  width: number;
  height: number;
  mapX: number;
  mapY: number;
  activeFloorId: string;
  cadBim?: BimModel | null;
};

export type MapAnalyzeResult = {
  rooms: DesignRoom[];
  bim: BimModel;
};

export type MapAnalyzePhase = 'detecting-rooms' | 'detecting-walls';

/** Fallback zone when raster/CAD room detection finds nothing — keeps placement on the plan. */
export function fallbackRoomsForMap(
  mapX: number,
  mapY: number,
  mapWidth: number,
  mapHeight: number,
  activeFloorId: string,
  bim: BimModel,
): DesignRoom[] {
  const id = `room_${Math.random().toString(36).slice(2, 10)}`;
  if (bim.walls.length > 0) {
    const xs = bim.walls.flatMap((w) => [w.x1, w.x2]);
    const ys = bim.walls.flatMap((w) => [w.y1, w.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [
      {
        id,
        label: 'Plan',
        zone: 'general',
        spaceKind: 'other',
        x: minX,
        y: minY,
        width: Math.max(80, maxX - minX),
        height: Math.max(80, maxY - minY),
        floorId: activeFloorId,
      },
    ];
  }
  return [
    {
      id,
      label: 'Plan area',
      zone: 'general',
      spaceKind: 'other',
      x: mapX + mapWidth * 0.08,
      y: mapY + mapHeight * 0.08,
      width: mapWidth * 0.84,
      height: mapHeight * 0.84,
      floorId: activeFloorId,
    },
  ];
}

/** Rooms + walls/openings from the file — never adds wizard fixtures, doors, or circuits. */
export async function analyzeImportedMap(
  input: MapAnalyzeInput,
  onPhase?: (phase: MapAnalyzePhase) => void,
): Promise<MapAnalyzeResult> {
  const { src, width, height, mapX, mapY, activeFloorId, cadBim } = input;

  onPhase?.('detecting-rooms');
  const detected = await detectRooms(src, mapX, mapY, width, height);
  await yieldToMain();

  const rooms = detected.map((r) => ({ ...r, id: uid('room'), floorId: activeFloorId }));

  let walls = cadBim?.walls ?? [];
  let openings = cadBim?.openings ?? [];
  let gardens = cadBim?.gardens;

  if (!walls.length) {
    onPhase?.('detecting-walls');
    const rasterBim = await detectBimFromMap(src, mapX, mapY, width, height);
    await yieldToMain();
    walls = rasterBim.walls;
    if (!openings.length) openings = rasterBim.openings;
    if (!gardens?.length && rasterBim.gardens?.length) gardens = rasterBim.gardens;
  }

  if (walls.length && openings.length) {
    openings = snapOpeningsToWalls(openings, walls);
  }

  const bim: BimModel = { walls, openings, gardens };

  return { rooms, bim };
}
