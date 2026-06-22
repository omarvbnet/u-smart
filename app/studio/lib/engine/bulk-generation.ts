import type { DesignRoom } from '../model';

/** Large imports / multi-space plans use compact placement to keep the UI responsive. */
export function isBulkGeneration(rooms: DesignRoom[]): boolean {
  return rooms.length >= 8;
}

export const BULK_MAX_FIXTURES_PER_ROOM = 6;
export const BULK_MAX_SOCKETS_PER_ROOM = 4;

export function capFixtureCount(count: number, rooms: DesignRoom[]): number {
  if (!isBulkGeneration(rooms)) return count;
  return Math.min(count, BULK_MAX_FIXTURES_PER_ROOM);
}

export function capSocketCount(count: number, rooms: DesignRoom[]): number {
  if (!isBulkGeneration(rooms)) return count;
  return Math.min(count, BULK_MAX_SOCKETS_PER_ROOM);
}
