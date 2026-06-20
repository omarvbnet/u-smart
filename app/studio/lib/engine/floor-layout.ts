/**
 * Multi-floor building layout — floors list + per-floor room templates.
 */
import type { DesignFloor, DesignRoom } from '../model';
import type { BuildingType, ProjectInfo } from '../project';
import { seedRoomsForBuilding } from './residential-layouts';

export function floorLabelForLevel(level: number): string {
  if (level === 0) return 'Ground Floor';
  if (level === 1) return 'First Floor';
  if (level === 2) return 'Second Floor';
  if (level === 3) return 'Third Floor';
  if (level < 0) return `Basement ${Math.abs(level)}`;
  return `Floor ${level + 1}`;
}

export function floorCountRange(buildingType: BuildingType): { min: number; max: number } {
  if (buildingType === 'apartment' || buildingType === 'house' || buildingType === 'villa') {
    return { min: 1, max: 5 };
  }
  if (buildingType === 'hotel' || buildingType === 'hospital' || buildingType === 'commercial') {
    return { min: 1, max: 12 };
  }
  return { min: 1, max: 8 };
}

export function buildFloorsFromCount(count: number, buildingType: BuildingType = 'villa'): DesignFloor[] {
  const { min, max } = floorCountRange(buildingType);
  const n = Math.min(max, Math.max(min, Math.round(count)));
  return Array.from({ length: n }, (_, i) => ({
    id: `floor_${i}`,
    label: floorLabelForLevel(i),
    level: i,
    elevationM: Number((i * 3.2).toFixed(1)),
  }));
}

/** Clone the building room template onto each floor with unique ids and floorId. */
export function seedRoomsForProject(project: ProjectInfo): DesignRoom[] {
  const floors = buildFloorsFromCount(project.floorCount, project.buildingType);
  const template = seedRoomsForBuilding(project.buildingType, project.bedrooms);
  if (floors.length <= 1) {
    return template.map((r) => ({ ...r, floorId: floors[0]!.id }));
  }
  const out: DesignRoom[] = [];
  for (const floor of floors) {
    for (const r of template) {
      out.push({
        ...r,
        id: `${r.id}__${floor.id}`,
        label: r.label,
        floorId: floor.id,
      });
    }
  }
  return out;
}

export function groundFloorId(floors: DesignFloor[]): string {
  return floors[0]?.id ?? 'floor_0';
}
