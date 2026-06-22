import type { DesignRoom } from '../model';

/** Large imports / multi-space plans use compact placement to keep the UI responsive. */
export function isBulkGeneration(rooms: DesignRoom[]): boolean {
  return rooms.length >= 4;
}

/** Wizard / map-import boot always uses compact placement. */
export function useCompactPlacement(rooms: DesignRoom[], initialBoot = false): boolean {
  return initialBoot || isBulkGeneration(rooms);
}

export const BULK_MAX_FIXTURES_PER_ROOM = 4;
export const BULK_MAX_SOCKETS_PER_ROOM = 3;

export function capFixtureCount(count: number, rooms: DesignRoom[], initialBoot = false): number {
  if (!useCompactPlacement(rooms, initialBoot)) return count;
  return Math.min(count, BULK_MAX_FIXTURES_PER_ROOM);
}

export function capSocketCount(count: number, rooms: DesignRoom[], initialBoot = false): number {
  if (!useCompactPlacement(rooms, initialBoot)) return count;
  return Math.min(count, BULK_MAX_SOCKETS_PER_ROOM);
}
