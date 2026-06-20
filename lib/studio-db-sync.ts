/**
 * Sync Studio design to normalized Prisma tables + validation/simulation logs.
 */
import { prisma } from '@/lib/prisma';
import type { DesignFile } from '@/app/studio/lib/store';
import type { Issue } from '@/app/studio/lib/engine/validation';

type StudioDb = {
  studioProject?: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  studioBuilding?: { upsert: (args: unknown) => Promise<{ id: string }> };
  studioFloor?: { upsert: (args: unknown) => Promise<{ id: string }> };
  studioRoom?: { deleteMany: (args: unknown) => Promise<unknown>; createMany: (args: unknown) => Promise<unknown> };
  studioDevice?: { deleteMany: (args: unknown) => Promise<unknown>; createMany: (args: unknown) => Promise<unknown> };
  studioValidationError?: {
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
  studioSimulationSession?: { create: (args: unknown) => Promise<unknown>; updateMany: (args: unknown) => Promise<unknown> };
  studioReport?: { create: (args: unknown) => Promise<unknown> };
};

function db(): StudioDb {
  return prisma as unknown as StudioDb;
}

export async function syncStudioBimFromDesign(projectId: string, file: DesignFile): Promise<void> {
  const d = db();
  if (!d.studioBuilding || !d.studioFloor || !d.studioRoom || !d.studioDevice) return;

  const building = await d.studioBuilding.upsert({
    where: { id: `${projectId}_b1` },
    create: { id: `${projectId}_b1`, projectId, name: file.designName || 'Building' },
    update: { name: file.designName || 'Building' },
  });

  const floor = await d.studioFloor.upsert({
    where: { id: `${projectId}_f0` },
    create: {
      id: `${projectId}_f0`,
      buildingId: building.id,
      name: 'Ground Floor',
      level: 0,
      mapWidth: file.map?.width ?? null,
      mapHeight: file.map?.height ?? null,
    },
    update: {
      mapWidth: file.map?.width ?? null,
      mapHeight: file.map?.height ?? null,
    },
  });

  await d.studioRoom.deleteMany({ where: { floorId: floor.id } });
  await d.studioDevice.deleteMany({ where: { floorId: floor.id } });

  const rooms = file.rooms ?? [];
  if (rooms.length) {
    await d.studioRoom.createMany({
      data: rooms.map((r) => ({
        id: r.id,
        floorId: floor.id,
        label: r.label,
        zone: r.zone,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        areaM2: (r.width / 50) * (r.height / 50),
      })),
    });
  }

  const nodes = file.nodes ?? [];
  if (nodes.length) {
    await d.studioDevice.createMany({
      data: nodes.map((n) => ({
        id: n.id,
        floorId: floor.id,
        catalogId: n.catalogId,
        label: n.label,
        x: n.x,
        y: n.y,
        params: n.params,
      })),
    });
  }
}

export async function persistValidationErrors(projectId: string, issues: Issue[]): Promise<void> {
  const d = db();
  if (!d.studioValidationError) return;
  await d.studioValidationError.deleteMany({ where: { projectId, deletedAt: null } });
  if (!issues.length) return;
  await d.studioValidationError.createMany({
    data: issues.map((i) => ({
      projectId,
      deviceId: i.nodeId ?? null,
      severity: i.severity === 'critical' ? 'CRITICAL' : i.severity === 'warning' ? 'WARNING' : 'RECOMMENDATION',
      code: i.code,
      title: i.title.en,
      detail: i.detail.en,
      standard: i.standards[0] ?? null,
      resolved: false,
    })),
  });
}

export async function persistSimulationSession(
  projectId: string,
  sessionId: string,
  state: unknown,
  active: boolean,
): Promise<void> {
  const d = db();
  if (!d.studioSimulationSession) return;
  if (!active) {
    await d.studioSimulationSession.updateMany({
      where: { projectId, active: true },
      data: { active: false, endedAt: new Date() },
    });
    return;
  }
  await d.studioSimulationSession.create({
    data: {
      id: sessionId,
      projectId,
      active: true,
      stateJson: state as object,
    },
  });
}

export async function recordStudioReport(
  projectId: string,
  type: string,
  title: string,
  meta: Record<string, unknown>,
): Promise<void> {
  const d = db();
  if (!d.studioReport) return;
  await d.studioReport.create({
    data: { projectId, type, title, meta: meta as object },
  });
}
