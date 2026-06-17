/**
 * U Smart Studio — server-side persistence (Prisma).
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { BuildingType, ProjectInfo } from '@/app/studio/lib/project';
import type { DesignFile } from '@/app/studio/lib/store';
import type { StudioProjectSummary } from '@/app/studio/lib/cloud-types';

export type { StudioProjectSummary };

type StudioBuildingType =
  | 'HOUSE'
  | 'VILLA'
  | 'APARTMENT'
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'HOTEL'
  | 'HOSPITAL'
  | 'INDUSTRIAL';

const BUILDING_MAP: Record<BuildingType, StudioBuildingType> = {
  house: 'HOUSE',
  villa: 'VILLA',
  apartment: 'APARTMENT',
  residential: 'RESIDENTIAL',
  commercial: 'COMMERCIAL',
  hotel: 'HOTEL',
  hospital: 'HOSPITAL',
  industrial: 'INDUSTRIAL',
};

const BUILDING_REVERSE: Record<StudioBuildingType, BuildingType> = {
  HOUSE: 'house',
  VILLA: 'villa',
  APARTMENT: 'apartment',
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  HOTEL: 'hotel',
  HOSPITAL: 'hospital',
  INDUSTRIAL: 'industrial',
};

type StudioProjectDelegate = {
  create: (args: unknown) => Promise<StudioRow>;
  update: (args: unknown) => Promise<StudioRow>;
  findFirst: (args: unknown) => Promise<StudioRow | null>;
  findMany: (args: unknown) => Promise<StudioRow[]>;
};

type StudioDb = {
  studioProject: StudioProjectDelegate;
  studioDesignRevision?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

function studioDelegate(): StudioDb {
  const p = prisma as unknown as {
    studioProject?: StudioProjectDelegate;
    studioDesignRevision?: StudioDb['studioDesignRevision'];
  };
  if (!p.studioProject) {
    throw new Error('STUDIO_SCHEMA_NOT_READY');
  }
  return {
    studioProject: p.studioProject,
    studioDesignRevision: p.studioDesignRevision,
  };
}

type StudioRow = {
  id: string;
  name: string;
  client: string | null;
  consultant: string | null;
  location: string | null;
  reference: string | null;
  revision: string;
  buildingType: StudioBuildingType;
  smartBuilding: boolean;
  smartProtocol: string | null;
  hvacMode: string;
  hvacTypes: string[];
  energySources: string[];
  standards: string[];
  designJson: unknown;
  shareToken: string | null;
  sharePublic: boolean;
  ownerUserId: string | null;
  updatedAt: Date;
  createdAt: Date;
};

/** Strip huge base64 map blobs before PostgreSQL storage. */
export function sanitizeDesignForCloud(file: DesignFile): DesignFile {
  if (!file.map?.src?.startsWith('data:')) return file;
  return {
    ...file,
    map: { ...file.map, src: '' },
  };
}

function projectFromRow(row: StudioRow): ProjectInfo {
  const json = (row.designJson ?? {}) as Partial<DesignFile>;
  const fromJson = json.project;
  return {
    client: row.client ?? '',
    consultant: row.consultant ?? '',
    location: row.location ?? '',
    reference: row.reference ?? '',
    revision: row.revision,
    buildingType: BUILDING_REVERSE[row.buildingType] ?? 'villa',
    standards: (row.standards.length ? row.standards : fromJson?.standards) as ProjectInfo['standards'],
    setupComplete: fromJson?.setupComplete ?? true,
    smartBuilding: row.smartBuilding,
    smartProtocol: (row.smartProtocol as ProjectInfo['smartProtocol']) ?? null,
    hvacMode: (row.hvacMode as ProjectInfo['hvacMode']) ?? 'auto',
    hvacTypes: (row.hvacTypes as ProjectInfo['hvacTypes']) ?? ['split'],
    energySources: (row.energySources as ProjectInfo['energySources']) ?? ['grid'],
    floorPlanSource: (fromJson?.floorPlanSource as ProjectInfo['floorPlanSource']) ?? 'none',
  };
}

export function designFileFromRow(row: StudioRow): DesignFile {
  const json = (row.designJson ?? {}) as Partial<DesignFile>;
  return {
    version: 1,
    designName: json.designName ?? row.name,
    nodes: json.nodes ?? [],
    edges: json.edges ?? [],
    controls: json.controls ?? {},
    map: json.map ?? null,
    rooms: json.rooms ?? [],
    project: projectFromRow(row),
  };
}

function rowPayload(file: DesignFile, name?: string) {
  const p = file.project;
  return {
    name: name ?? (file.designName || 'Untitled design'),
    client: p?.client || null,
    consultant: p?.consultant || null,
    location: p?.location || null,
    reference: p?.reference || null,
    revision: p?.revision ?? 'R0',
    buildingType: BUILDING_MAP[p?.buildingType ?? 'villa'],
    smartBuilding: p?.smartBuilding ?? false,
    smartProtocol: p?.smartProtocol ?? null,
    hvacMode: p?.hvacMode ?? 'auto',
    hvacTypes: p?.hvacTypes ?? [],
    energySources: p?.energySources ?? ['grid'],
    standards: p?.standards ?? [],
    designJson: sanitizeDesignForCloud(file),
  };
}

export async function createStudioProject(file: DesignFile, ownerUserId: string | null): Promise<StudioProjectSummary> {
  const db = studioDelegate();
  const shareToken = randomBytes(16).toString('hex');
  const row = await db.studioProject.create({
    data: {
      ...rowPayload(file),
      ownerUserId,
      shareToken,
      sharePublic: false,
    },
  });
  await recordRevision(db, row.id, file, ownerUserId);
  return toSummary(row);
}

export async function updateStudioProject(
  id: string,
  file: DesignFile,
  ownerUserId: string | null,
): Promise<StudioProjectSummary> {
  const db = studioDelegate();
  const existing = await db.studioProject.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.ownerUserId && ownerUserId && existing.ownerUserId !== ownerUserId) {
    throw new Error('FORBIDDEN');
  }
  const row = await db.studioProject.update({
    where: { id },
    data: rowPayload(file, file.designName),
  });
  await recordRevision(db, id, file, ownerUserId);
  return toSummary(row);
}

export async function getStudioProject(id: string, ownerUserId: string | null): Promise<DesignFile & { id: string; shareToken: string | null }> {
  const db = studioDelegate();
  const row = await db.studioProject.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw new Error('NOT_FOUND');
  if (row.ownerUserId && ownerUserId && row.ownerUserId !== ownerUserId && !row.sharePublic) {
    throw new Error('FORBIDDEN');
  }
  const file = designFileFromRow(row);
  return { ...file, id: row.id, shareToken: row.shareToken };
}

export async function getStudioProjectByShareToken(token: string): Promise<DesignFile & { id: string }> {
  const db = studioDelegate();
  const row = await db.studioProject.findFirst({
    where: { shareToken: token, deletedAt: null, sharePublic: true },
  });
  if (!row) throw new Error('NOT_FOUND');
  return { ...designFileFromRow(row), id: row.id };
}

export async function listStudioProjects(ownerUserId: string | null): Promise<StudioProjectSummary[]> {
  if (!ownerUserId) return [];
  const db = studioDelegate();
  const rows = await db.studioProject.findMany({
    where: { ownerUserId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return rows.map(toSummary);
}

async function recordRevision(
  db: ReturnType<typeof studioDelegate>,
  projectId: string,
  file: DesignFile,
  userId: string | null,
) {
  if (!db.studioDesignRevision) return;
  await db.studioDesignRevision.create({
    data: {
      projectId,
      revision: file.project?.revision ?? 'R0',
      designJson: sanitizeDesignForCloud(file),
      createdById: userId,
      note: 'autosave',
    },
  });
}

function toSummary(row: StudioRow): StudioProjectSummary {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    buildingType: BUILDING_REVERSE[row.buildingType] ?? 'villa',
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    shareToken: row.shareToken,
  };
}
