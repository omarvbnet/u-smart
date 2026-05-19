import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getWorkspaceSiteGuard } from '@/lib/private-company-sites';
import {
  applySiteQfieldMapAction,
  parseSiteQfieldProjects,
  siteQfieldProjectsJson,
} from '@/lib/qfield-site-map-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MAP_ACTIONS = new Set(['add_map_note', 'delete_map_note']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await getWorkspaceSiteGuard(req);
  if (!g.ok) return g.response;
  const { guard } = g;

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

  const row = await prisma.privateCompanySite.findFirst({
    where: { id: siteId, companyId: guard.companyId },
    select: { siteCode: true, qfieldProjects: true },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Site not found.' }, { status: 404 });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: guard.requesterId },
    select: { name: true, username: true, role: true },
  });
  const actorName = me?.name ?? me?.username ?? 'Staff';
  const actorRole = String(me?.role ?? '');

  const projects = parseSiteQfieldProjects(row.qfieldProjects);
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  const result = await applySiteQfieldMapAction({
    projects,
    projectId,
    action,
    body,
    requesterId: guard.requesterId,
    actorName,
    actorRole,
    siteCode: row.siteCode,
    companyId: guard.companyId,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: result.status });
  }

  await prisma.privateCompanySite.update({
    where: { id: siteId },
    data: {
      qfieldProjects: siteQfieldProjectsJson(result.projects),
      hasQfield: result.projects.length > 0,
    },
  });

  return NextResponse.json({ success: true, qfieldProjects: result.projects });
}
