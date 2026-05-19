import {
  newQfieldEntityId,
  parseQFieldProjectsFromCompanyJson,
  pickQfieldProjectForPreview,
  qfieldProjectsToJsonValue,
  type QFieldProjectStored,
} from '@/lib/qfield-projects';
import { canDeleteQFieldMapNote, notifySiteQFieldMapCommentAdded } from '@/lib/qfield-map-note-notify';

export function parseSiteQfieldProjects(raw: unknown): QFieldProjectStored[] {
  return parseQFieldProjectsFromCompanyJson({ qfieldProjects: raw });
}

export function findProjectIndex(projects: QFieldProjectStored[], projectId: string): number {
  const pid = projectId.trim();
  if (!pid) return projects.length === 1 ? 0 : -1;
  const idx = projects.findIndex((p) => p.id === pid);
  if (idx >= 0) return idx;
  return projects.length === 1 ? 0 : -1;
}

export async function applySiteQfieldMapAction(args: {
  projects: QFieldProjectStored[];
  projectId: string;
  action: string;
  body: Record<string, unknown>;
  requesterId: string;
  actorName: string;
  actorRole: string;
  siteCode: string;
  companyId: string | null;
}): Promise<{ ok: true; projects: QFieldProjectStored[] } | { ok: false; status: number; message: string }> {
  const idx = findProjectIndex(args.projects, args.projectId);
  if (idx < 0) {
    return { ok: false, status: 404, message: 'QField project not found.' };
  }

  const action = args.action.trim().toLowerCase();

  if (action === 'add_map_note') {
    const latRaw = args.body.latitude;
    const lngRaw = args.body.longitude;
    const lat =
      typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' ? parseFloat(latRaw) : NaN;
    const lng =
      typeof lngRaw === 'number' ? lngRaw : typeof lngRaw === 'string' ? parseFloat(lngRaw) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, status: 400, message: 'latitude and longitude must be numbers' };
    }
    const noteText = typeof args.body.note === 'string' ? args.body.note.trim() : '';
    if (!noteText) {
      return { ok: false, status: 400, message: 'note is required' };
    }
    const at = new Date().toISOString();
    const list = args.projects[idx].mapNotes ?? [];
    list.push({
      id: newQfieldEntityId(),
      latitude: lat,
      longitude: lng,
      note: noteText,
      createdAt: at,
      byRequesterId: args.requesterId,
      byName: args.actorName,
    });
    args.projects[idx].mapNotes = list;
    args.projects[idx].updatedAt = at;

    if (args.companyId) {
      notifySiteQFieldMapCommentAdded({
        companyId: args.companyId,
        authorRequesterId: args.requesterId,
        authorName: args.actorName,
        authorRole: args.actorRole,
        siteCode: args.siteCode,
        comment: noteText,
        projectId: args.projects[idx].id,
      }).catch((e) => console.error('site add_map_note notify:', e));
    }
  } else if (action === 'delete_map_note') {
    const noteId = typeof args.body.noteId === 'string' ? args.body.noteId.trim() : '';
    if (!noteId) {
      return { ok: false, status: 400, message: 'noteId is required' };
    }
    const list = args.projects[idx].mapNotes ?? [];
    const noteIdx = list.findIndex((n) => n.id === noteId);
    if (noteIdx < 0) {
      return { ok: false, status: 404, message: 'Map comment not found' };
    }
    const target = list[noteIdx];
    const { prisma: _prisma } = await import('@/lib/prisma');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mayDelete = await canDeleteQFieldMapNote(_prisma as any, args.requesterId, target);
    if (!mayDelete) {
      return { ok: false, status: 403, message: 'Forbidden' };
    }
    list.splice(noteIdx, 1);
    args.projects[idx].mapNotes = list;
    args.projects[idx].updatedAt = new Date().toISOString();
  } else {
    return { ok: false, status: 400, message: 'Invalid action' };
  }

  return { ok: true, projects: args.projects };
}

export function siteQfieldProjectsJson(projects: QFieldProjectStored[]): unknown {
  return qfieldProjectsToJsonValue(projects);
}

export { pickQfieldProjectForPreview };
