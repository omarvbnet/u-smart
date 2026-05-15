import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  newQfieldEntityId,
  parseQFieldProjectsFromCompanyJson,
  qfieldProjectsToJsonValue,
} from '@/lib/qfield-projects';
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
  if (!['add_revision', 'update_meta'].includes(action)) {
    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  }

  const canWrite = await canManageTicketQFieldProjects(prisma, ticketId, auth.payload.requesterId);
  if (!canWrite) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const row = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: { company: true },
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
    projects[idx].updatedAt = new Date().toISOString();
  } else {
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
  }

  parsed.qfieldProjects = qfieldProjectsToJsonValue(projects);

  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });

  return NextResponse.json({ success: true, qfieldProjects: projects });
}
