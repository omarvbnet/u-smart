/**
 * QField / QGIS mobile project files stored on `visitor_requests.company` JSON as `qfieldProjects`.
 */

export type QFieldRevisionStored = {
  id: string;
  url: string;
  fileName: string;
  at: string;
  byRequesterId?: string | null;
  byName?: string | null;
  note?: string | null;
};

export type QFieldMapAnnotationStored = {
  latitude: number;
  longitude: number;
  note?: string | null;
  updatedAt: string;
  byRequesterId?: string | null;
  byName?: string | null;
};

/** Shared map comment visible to all staff on the project map. */
export type QFieldMapNoteStored = {
  id: string;
  latitude: number;
  longitude: number;
  note: string;
  createdAt: string;
  byRequesterId?: string | null;
  byName?: string | null;
};

export type QFieldProjectStored = {
  id: string;
  title: string;
  description?: string | null;
  /** Latest file URL (same as last revision when revisions exist). */
  currentUrl: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  revisions: QFieldRevisionStored[];
  /** Optional field pin / note placed on the in-app map (WGS84). */
  mapAnnotation?: QFieldMapAnnotationStored | null;
  /** Engineer comments pinned on the map (shared with all staff). */
  mapNotes?: QFieldMapNoteStored[];
  /** In-app edits to layer feature attributes (featureId → column → value). */
  fieldEdits?: Record<string, Record<string, string | number | boolean | null>> | null;
};

function parseMapNotes(raw: unknown): QFieldMapNoteStored[] {
  if (!Array.isArray(raw)) return [];
  const out: QFieldMapNoteStored[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    const lat =
      typeof item.latitude === 'number'
        ? item.latitude
        : typeof item.latitude === 'string'
          ? parseFloat(item.latitude)
          : NaN;
    const lng =
      typeof item.longitude === 'number'
        ? item.longitude
        : typeof item.longitude === 'string'
          ? parseFloat(item.longitude)
          : NaN;
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || !note || !createdAt) continue;
    out.push({
      id,
      latitude: lat,
      longitude: lng,
      note,
      createdAt,
      byRequesterId: typeof item.byRequesterId === 'string' ? item.byRequesterId : null,
      byName: typeof item.byName === 'string' ? item.byName : null,
    });
  }
  return out;
}

export function newQfieldEntityId(): string {
  return `qfp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function parseQFieldProjectsFromCompanyJson(parsed: Record<string, unknown>): QFieldProjectStored[] {
  const raw = parsed.qfieldProjects;
  if (!Array.isArray(raw)) return [];
  const out: QFieldProjectStored[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const currentUrl = typeof item.currentUrl === 'string' ? item.currentUrl.trim() : '';
    const fileName = typeof item.fileName === 'string' ? item.fileName.trim() : '';
    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
    if (!id || !currentUrl || !fileName || !createdAt) continue;
    const description = typeof item.description === 'string' ? item.description : null;
    const revRaw = item.revisions;
    const revisions: QFieldRevisionStored[] = [];
    if (Array.isArray(revRaw)) {
      for (const r of revRaw) {
        if (!isRecord(r)) continue;
        const rid = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
        const url = typeof r.url === 'string' ? r.url.trim() : '';
        const fn = typeof r.fileName === 'string' ? r.fileName.trim() : '';
        const at = typeof r.at === 'string' ? r.at : '';
        if (!rid || !url || !fn || !at) continue;
        revisions.push({
          id: rid,
          url,
          fileName: fn,
          at,
          byRequesterId: typeof r.byRequesterId === 'string' ? r.byRequesterId : null,
          byName: typeof r.byName === 'string' ? r.byName : null,
          note: typeof r.note === 'string' ? r.note : null,
        });
      }
    }
    let mapAnnotation: QFieldMapAnnotationStored | null = null;
    const ma = item.mapAnnotation;
    if (ma && typeof ma === 'object' && !Array.isArray(ma)) {
      const m = ma as Record<string, unknown>;
      const lat = typeof m.latitude === 'number' ? m.latitude : typeof m.latitude === 'string' ? parseFloat(m.latitude) : NaN;
      const lng = typeof m.longitude === 'number' ? m.longitude : typeof m.longitude === 'string' ? parseFloat(m.longitude) : NaN;
      const updatedAt = typeof m.updatedAt === 'string' ? m.updatedAt : '';
      if (Number.isFinite(lat) && Number.isFinite(lng) && updatedAt) {
        mapAnnotation = {
          latitude: lat,
          longitude: lng,
          note: typeof m.note === 'string' ? m.note : null,
          updatedAt,
          byRequesterId: typeof m.byRequesterId === 'string' ? m.byRequesterId : null,
          byName: typeof m.byName === 'string' ? m.byName : null,
        };
      }
    }
    let fieldEdits: QFieldProjectStored['fieldEdits'] = null;
    const fe = item.fieldEdits;
    if (fe && typeof fe === 'object' && !Array.isArray(fe)) {
      fieldEdits = fe as Record<string, Record<string, string | number | boolean | null>>;
    }
    const mapNotes = parseMapNotes(item.mapNotes);
    out.push({
      id,
      title: title || fileName,
      description,
      currentUrl,
      fileName,
      createdAt,
      updatedAt,
      revisions,
      mapAnnotation,
      mapNotes,
      fieldEdits,
    });
  }
  return out;
}

export function qfieldProjectsToJsonValue(projects: QFieldProjectStored[]): unknown {
  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description ?? null,
    currentUrl: p.currentUrl,
    fileName: p.fileName,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    mapAnnotation: p.mapAnnotation ?? null,
    mapNotes: p.mapNotes ?? [],
    fieldEdits: p.fieldEdits ?? null,
    revisions: p.revisions.map((r) => ({
      id: r.id,
      url: r.url,
      fileName: r.fileName,
      at: r.at,
      byRequesterId: r.byRequesterId ?? null,
      byName: r.byName ?? null,
      note: r.note ?? null,
    })),
  }));
}

/** Normalize client payload when creating a ticket: `{ url, fileName, title?, description? }[]` */
export function normalizeQFieldProjectsFromCreateBody(raw: unknown): QFieldProjectStored[] {
  if (!Array.isArray(raw)) return [];
  const now = new Date().toISOString();
  const out: QFieldProjectStored[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const fileName = typeof item.fileName === 'string' ? item.fileName.trim() : '';
    if (!url || !fileName) continue;
    const titleRaw = typeof item.title === 'string' ? item.title.trim() : '';
    const title = titleRaw || fileName;
    const description = typeof item.description === 'string' ? item.description.trim() : null;
    const id = newQfieldEntityId();
    const revId = newQfieldEntityId();
    out.push({
      id,
      title,
      description: description || null,
      currentUrl: url,
      fileName,
      createdAt: now,
      updatedAt: now,
      mapAnnotation: null,
      mapNotes: [],
      revisions: [
        {
          id: revId,
          url,
          fileName,
          at: now,
          byRequesterId: typeof item.addedByRequesterId === 'string' ? item.addedByRequesterId : null,
          byName: typeof item.addedByName === 'string' ? item.addedByName : null,
          note: typeof item.note === 'string' ? item.note : 'Initial upload',
        },
      ],
    });
  }
  return out;
}
