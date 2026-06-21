/**
 * Move room geometry and all linked devices/openings while preserving relative layout.
 */
import type { DesignNode, DesignRoom } from '../model';
import { parseRoutePoints, serializeRoutePoints } from './cable-map';

export function nodeBelongsToRoom(n: DesignNode, room: DesignRoom): boolean {
  if (n.params.roomId === room.id) return true;
  if (n.floorId && room.floorId && n.floorId !== room.floorId) return false;
  const cx = n.x + 21;
  const cy = n.y + 21;
  return cx >= room.x && cx <= room.x + room.width && cy >= room.y && cy <= room.y + room.height;
}

export function translateNodesForRoomMove(
  nodes: DesignNode[],
  room: DesignRoom,
  dx: number,
  dy: number,
): DesignNode[] {
  return nodes.map((n) => {
    if (!nodeBelongsToRoom(n, room)) return n;
    const params = { ...n.params };
    const points = parseRoutePoints(params);
    if (points.length >= 2) {
      params.routePoints = serializeRoutePoints(points.map((p) => ({ x: p.x + dx, y: p.y + dy })));
    }
    return { ...n, x: n.x + dx, y: n.y + dy, params };
  });
}
