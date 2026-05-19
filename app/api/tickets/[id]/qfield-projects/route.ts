import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  newQfieldEntityId,
  parseQFieldProjectsFromCompanyJson,
  qfieldProjectsToJsonValue,
} from '@/lib/qfield-projects';
import { notifyQFieldMapCommentAdded } from '@/lib/qfield-map-note-notify';
import { parseTicketCompanyJson } from '@/lib/private-company-kpi';
import { canManageTicketQFieldProjects } from '@/lib/qfield-ticket-write';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id: ticketId } = await params;
  if (!ticketId) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (!['add_revision', 'update_meta', 'set_map_annotation', 'add_map_note'].includes(action)) {
    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  }

  const canWrite = await canManageTicketQFieldProjects(prisma, ticketId, auth.payload.requesterId);
  if (!canWrite) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const row = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: {
      company: true,
      siteName: true,
      privateCompanyId: true,
    },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
  } catch {
    parsed = {};
  }
  if (!parsed._ticket) {
    return NextResponse.json({ success: false, message: 'Invalid ticket payload' }, { status: 400 });
  }

  const ticketParsed = parseTicketCompanyJson(row.company);
  const siteId =
    (row.siteName as string | null)?.trim() ||
    (typeof ticketParsed.siteName === 'string' ? ticketParsed.siteName.trim() : '') ||
    'Site';

  const projects = parseQFieldProjectsFromCompanyJson(parsed);
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx < 0) {
    return NextResponse.json({ success: false, message: 'QField project not found' }, { status: 404 });
  }

  if (action === 'update_meta') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const descRaw = body.description;
    const description =
      typeof descRaw === 'string' ? descRaw.trim() : descRaw === null ? '' : undefined;
    if (title) projects[idx].title = title;
    if (description !== undefined) {
      projects[idx].description = description.length > 0 ? description : null;
    }
    const fe = body.fieldEdits;
    if (fe !== undefined) {
      if (fe === null) {
        projects[idx].fieldEdits = null;
      } else if (typeof fe === 'object' && !Array.isArray(fe)) {
        projects[idx].fieldEdits = fe as Record<
          string,
          Record<string, string | number | boolean | null>
        >;
      }
    }
    projects[idx].updatedAt = new Date().toISOString();
  } else if (action === 'add_revision') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    if (!url || !fileName) {
      return NextResponse.json(
        { success: false, message: 'url and fileName are required' },
        { status: 400 }
      );
    }
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { name: true, username: true },
    });
    const byName = ((me?.name as string) || (me?.username as string) || '').trim() || null;
    const noteRaw = typeof body.note === 'string' ? body.note.trim() : '';
    const at = new Date().toISOString();
    projects[idx].revisions.push({
      id: newQfieldEntityId(),
      url,
      fileName,
      at,
      byRequesterId: auth.payload.requesterId,
      byName,
      note: noteRaw.length > 0 ? noteRaw : null,
    });
    projects[idx].currentUrl = url;
    projects[idx].fileName = fileName;
    projects[idx].updatedAt = at;
  } else if (action === 'add_map_note') {
    const latRaw = body.latitude;
    const lngRaw = body.longitude;
    const lat =
      typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' ? parseFloat(latRaw) : NaN;
    const lng =
      typeof lngRaw === 'number' ? lngRaw : typeof lngRaw === 'string' ? parseFloat(lngRaw) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { success: false, message: 'latitude and longitude must be numbers' },
        { status: 400 }
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { success: false, message: 'Coordinates out of valid WGS84 range' },
        { status: 400 }
      );
    }
    const noteText = typeof body.note === 'string' ? body.note.trim() : '';
    if (!noteText) {
      return NextResponse.json({ success: false, message: 'note is required' }, { status: 400 });
    }
    if (noteText.length > 4000) {
      return NextResponse.json({ success: false, message: 'note is too long' }, { status: 400 });
    }
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { name: true, username: true, role: true },
    });
    const byName = ((me?.name as string) || (me?.username as string) || '').trim() || null;
    const at = new Date().toISOString();
    const list = projects[idx].mapNotes ?? [];
    list.push({
      id: newQfieldEntityId(),
      latitude: lat,
      longitude: lng,
      note: noteText,
      createdAt: at,
      byRequesterId: auth.payload.requesterId,
      byName,
    });
    projects[idx].mapNotes = list;
    projects[idx].updatedAt = at;

    notifyQFieldMapCommentAdded({
      ticketId,
      authorRequesterId: auth.payload.requesterId,
      authorName: byName ?? 'Staff',
      authorRole: String(me?.role ?? ''),
      siteId,
      comment: noteText,
      privateCompanyId: (row.privateCompanyId as string | null) ?? null,
      companyJson: row.company,
      projectId,
    }).catch((e) => console.error('add_map_note notify:', e));
  } else {
    const clear = body.clear === true;
    if (clear) {
      projects[idx].mapAnnotation = null;
    } else {
      const latRaw = body.latitude;
      const lngRaw = body.longitude;
      const lat =
        typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' ? parseFloat(latRaw) : NaN;
      const lng =
        typeof lngRaw === 'number' ? lngRaw : typeof lngRaw === 'string' ? parseFloat(lngRaw) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json(
          { success: false, message: 'latitude and longitude must be numbers' },
          { status: 400 }
        );
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json(
          { success: false, message: 'Coordinates out of valid WGS84 range' },
          { status: 400 }
        );
      }
      const me = await prisma.ticketRequester.findUnique({
        where: { id: auth.payload.requesterId },
        select: { name: true, username: true },
      });
      const byName = ((me?.name as string) || (me?.username as string) || '').trim() || null;
      const noteMap = typeof body.note === 'string' ? body.note.trim() : '';
      const at = new Date().toISOString();
      projects[idx].mapAnnotation = {
        latitude: lat,
        longitude: lng,
        note: noteMap.length > 0 ? noteMap : null,
        updatedAt: at,
        byRequesterId: auth.payload.requesterId,
        byName,
      };
    }
    projects[idx].updatedAt = new Date().toISOString();
  }

  parsed.qfieldProjects = qfieldProjectsToJsonValue(projects);

  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });

  return NextResponse.json({ success: true, qfieldProjects: projects });
}
