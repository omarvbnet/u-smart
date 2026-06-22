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

/** Rooms + walls/openings from the file — never adds wizard fixtures, doors, or circuits. */
export async function analyzeImportedMap(input: MapAnalyzeInput): Promise<MapAnalyzeResult> {
  const { src, width, height, mapX, mapY, activeFloorId, cadBim } = input;

  const detected = await detectRooms(src, mapX, mapY, width, height);
  await yieldToMain();

  const rooms = detected.map((r) => ({ ...r, id: uid('room'), floorId: activeFloorId }));

  let walls = cadBim?.walls ?? [];
  let openings = cadBim?.openings ?? [];
  let gardens = cadBim?.gardens;

  if (!walls.length) {
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
