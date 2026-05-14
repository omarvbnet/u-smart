import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';
import { fetchWorkspaceTechniqueRows, staffTicketTechniqueAllowed } from '@/lib/workspace-task-assignment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

/**
 * POST /api/tickets/[id]/maintenance-crew
 * Body: { action: "join" | "leave" }
 * Workspace maintenance tickets only; technicians add/remove themselves from
 * maintenanceCrewIds when proximity teaming is enabled for their department (or override).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const { id: ticketId } = await params;
  if (!ticketId) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (action !== 'join' && action !== 'leave') {
    return NextResponse.json({ success: false, message: 'action must be join or leave' }, { status: 400 });
  }

  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      privateCompanyId: true,
      privateCompanyDepartmentId: true,
      privateCompanyAllowedTaskSlugs: true,
      maintenanceProximityJoinOverride: true,
      maintenanceProximityRadiusOverrideM: true,
    },
  });
  if (!me || String(me.role ?? '').toUpperCase() !== 'TECHNICIAN') {
    return NextResponse.json(
      { success: false, message: 'Only technicians can change maintenance crew.' },
      { status: 403 }
    );
  }

  const ticket = await prisma.visitorRequest.findFirst({
    where: { id: ticketId },
    select: {
      id: true,
      technique: true,
      status: true,
      privateCompanyId: true,
      assignmentScope: true,
      company: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }
  if (ticket.privateCompanyId !== me.privateCompanyId || !me.privateCompanyId) {
    return NextResponse.json({ success: false, message: 'Ticket is not in your workspace.' }, { status: 403 });
  }
  if (ticket.assignmentScope !== 'PRIVATE_COMPANY_STAFF') {
    return NextResponse.json(
      { success: false, message: 'Crew is only for workspace-scoped tickets.' },
      { status: 400 }
    );
  }
  const tech = String(ticket.technique ?? '').toLowerCase();
  if (!MAINTENANCE_TECHNIQUES.includes(tech)) {
    return NextResponse.json({ success: false, message: 'Not a maintenance ticket.' }, { status: 400 });
  }
  if (String(ticket.status ?? '').toUpperCase() === 'COMPLETED') {
    return NextResponse.json({ success: false, message: 'Ticket is completed.' }, { status: 400 });
  }

  const workspaceRows = await fetchWorkspaceTechniqueRows(prisma, me.privateCompanyId);
  const staffSlugs = Array.isArray(me.privateCompanyAllowedTaskSlugs)
    ? (me.privateCompanyAllowedTaskSlugs as string[])
    : [];
  if (
    !staffTicketTechniqueAllowed({
      technique: ticket.technique ?? '',
      staffDepartmentId: me.privateCompanyDepartmentId ?? null,
      staffAllowedSlugs: staffSlugs,
      workspaceRows,
    })
  ) {
    return NextResponse.json(
      { success: false, message: 'You are not allowed for this ticket type in your workspace.' },
      { status: 403 }
    );
  }

  let deptEnabled = false;
  let deptRadius = 100;
  if (me.privateCompanyDepartmentId) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: me.privateCompanyDepartmentId, companyId: ticket.privateCompanyId },
      select: { maintenanceProximityJoinEnabled: true, maintenanceProximityRadiusM: true },
    });
    deptEnabled = dept?.maintenanceProximityJoinEnabled === true;
    if (typeof dept?.maintenanceProximityRadiusM === 'number') {
      deptRadius = dept.maintenanceProximityRadiusM;
    }
  }
  const overrideJoin = me.maintenanceProximityJoinOverride as boolean | null | undefined;
  const effectiveJoin = overrideJoin === true ? true : overrideJoin === false ? false : deptEnabled;
  if (!effectiveJoin) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Multi-technician crew is not enabled for your department. Ask the workspace owner to enable it.',
      },
      { status: 403 }
    );
  }

  const parsed = parseTicketCompanyJson(ticket.company);
  if (!parsed._ticket) parsed._ticket = true;
  let crew = maintenanceCrewIdsFromCompanyJson(parsed);
  const lead = assignedStaffIdFromCompanyJson(parsed);

  if (action === 'join') {
    if (lead === me.id || crew.includes(me.id)) {
      return NextResponse.json({ success: true, maintenanceCrewIds: crew });
    }
    crew = [...crew, me.id];
    parsed.maintenanceCrewIds = crew;
    await prisma.visitorRequest.update({
      where: { id: ticketId },
      data: { company: JSON.stringify(parsed) },
    });
    const displayName = (String(me.name ?? '').trim() || me.username || me.id) as string;
    const targets = new Set<string>();
    if (lead) targets.add(lead);
    for (const cid of crew) {
      if (cid !== me.id) targets.add(cid);
    }
    for (const uid of targets) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'maintenance_crew_joined',
          ticketId,
          requesterId: uid,
          payload: {
            key: 'maintenance_crew_joined',
            vars: { name: displayName, ticketId },
          },
          data: { ticketId, type: 'maintenance_crew_joined', joinedBy: me.id },
        });
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ success: true, maintenanceCrewIds: crew });
  }

  crew = crew.filter((x) => x !== me.id);
  parsed.maintenanceCrewIds = crew;
  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });
  return NextResponse.json({ success: true, maintenanceCrewIds: crew });
}
