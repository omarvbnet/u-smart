import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  applySiteQfieldMapAction,
  parseSiteQfieldProjects,
  siteQfieldProjectsJson,
} from '@/lib/qfield-site-map-actions';

function getSiteDelegate() {
  return (prisma as any).site;
}

const MAP_ACTIONS = new Set(['add_map_note', 'delete_map_note']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;

  const { id: siteId } = await params;
  if (!siteId) {
    return NextResponse.json({ success: false, message: 'Site id is required.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (!MAP_ACTIONS.has(action)) {
    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  }

  const siteDelegate = getSiteDelegate();
  if (!siteDelegate?.findUnique) {
    return NextResponse.json({ success: false, message: 'Sites not available.' }, { status: 503 });
  }

  const row = await siteDelegate.findUnique({
    where: { id: siteId },
    select: { requesterId: true, siteId: true, qfieldProjects: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
  }

  const isOwner = row.requesterId === payload.requesterId;
  let canAccess = isOwner;
  if (!canAccess) {
    try {
      const share = await (prisma as any).siteShare.findFirst({
        where: { siteId, sharedWithRequesterId: payload.requesterId },
        select: { id: true },
      });
      canAccess = !!share;
    } catch {
      canAccess = false;
    }
  }
  if (!canAccess) {
    return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: payload.requesterId },
    select: { name: true, username: true, role: true, privateCompanyId: true },
  });
  const actorName = ((me?.name as string) || (me?.username as string) || '').trim() || 'Staff';
  const actorRole = String(me?.role ?? '');

  const projects = parseSiteQfieldProjects(row.qfieldProjects);
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const result = await applySiteQfieldMapAction({
    projects,
    projectId,
    action,
    body,
    requesterId: payload.requesterId,
    actorName,
    actorRole,
    siteCode: row.siteId,
    companyId: (me?.privateCompanyId as string | null) ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: result.status });
  }

  await siteDelegate.update({
    where: { id: siteId },
    data: { qfieldProjects: siteQfieldProjectsJson(result.projects), hasQfield: result.projects.length > 0 },
  });

  return NextResponse.json({ success: true, qfieldProjects: result.projects });
}
