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
import {
  findActiveMaintenanceCrewConflict,
  isWorkspaceCrewTicketTechnique,
} from '@/lib/workspace-maintenance-crew';
import { haversineDistanceMeters, clampProximityRadiusMeters } from '@/lib/geo-distance';
import { resolveTicketSitePointForVisitor } from '@/lib/ticket-detail-enrichment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const WORKSPACE_CREW_MEMBER_ROLES = new Set(['TECHNICIAN', 'ENGINEER', 'MANAGER', 'COORDINATOR']);

function isWorkspaceCrewMemberRole(role: string | null | undefined): boolean {
  return WORKSPACE_CREW_MEMBER_ROLES.has(String(role ?? '').toUpperCase());
}

function parseClientLatLng(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const la = Number(o.latitude);
  const lo = Number(o.longitude);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lng: lo };
}

/**
 * POST /api/tickets/[id]/maintenance-crew
 * Body: { action: "join" | "leave", latitude?, longitude? }
 * Join requires GPS within the workspace proximity radius (department default ± owner
 * per-staff override). Lead / crew receive localized notifications after a successful join.
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
  if (!me || !isWorkspaceCrewMemberRole(me.role as string)) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Only workspace engineers, managers, coordinators, or technicians can change ticket crew.',
      },
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
      privateCompanyTargetDepartmentId: true,
      company: true,
      siteName: true,
      requesterId: true,
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
  const crewTicketOk = await isWorkspaceCrewTicketTechnique(
    prisma,
    ticket.privateCompanyId as string,
    ticket.technique
  );
  if (!crewTicketOk) {
    return NextResponse.json(
      { success: false, message: 'Crew join is only for workspace maintenance or inspection tickets.' },
      { status: 400 }
    );
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

  const targetDept = ticket.privateCompanyTargetDepartmentId ?? null;
  const myDept = me.privateCompanyDepartmentId ?? null;
  if (targetDept && (myDept == null || myDept !== targetDept)) {
    return NextResponse.json(
      { success: false, message: 'This ticket is scoped to another department.' },
      { status: 403 }
    );
  }

  let deptEnabled = false;
  let deptRadiusM = 100;
  if (me.privateCompanyDepartmentId) {
    const dept = await prisma.privateCompanyDepartment.findFirst({
      where: { id: me.privateCompanyDepartmentId, companyId: ticket.privateCompanyId },
      select: { maintenanceProximityJoinEnabled: true, maintenanceProximityRadiusM: true },
    });
    deptEnabled = dept?.maintenanceProximityJoinEnabled === true;
    if (typeof dept?.maintenanceProximityRadiusM === 'number') {
      deptRadiusM = clampProximityRadiusMeters(dept.maintenanceProximityRadiusM);
    }
  }
  const overrideJoin = me.maintenanceProximityJoinOverride as boolean | null | undefined;
  const effectiveJoin = overrideJoin === true ? true : overrideJoin === false ? false : deptEnabled;
  if (!effectiveJoin) {
    return NextResponse.json(
      {
        success: false,
        message:
          'Multi-technician crew is not enabled for your department. Ask the workspace owner to enable it under department settings.',
      },
      { status: 403 }
    );
  }

  const overrideRadiusRaw = me.maintenanceProximityRadiusOverrideM as number | null | undefined;
  const effectiveRadiusM =
    typeof overrideRadiusRaw === 'number' && Number.isFinite(overrideRadiusRaw)
      ? clampProximityRadiusMeters(overrideRadiusRaw)
      : deptRadiusM;

  const parsed = parseTicketCompanyJson(ticket.company);
  if (!parsed._ticket) parsed._ticket = true;
  let crew = maintenanceCrewIdsFromCompanyJson(parsed);
  const lead = assignedStaffIdFromCompanyJson(parsed);

  if (action === 'join') {
    if (lead === me.id || crew.includes(me.id)) {
      return NextResponse.json({ success: true, maintenanceCrewIds: crew });
    }
    const busy = await findActiveMaintenanceCrewConflict(prisma, {
      companyId: ticket.privateCompanyId as string,
      requesterId: me.id,
      excludeTicketId: ticketId,
    });
    if (busy.conflict) {
      return NextResponse.json({ success: false, message: busy.message }, { status: 409 });
    }

    const clientPos = parseClientLatLng(body);
    if (!clientPos) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your current GPS position (latitude and longitude) is required to join the ticket crew so we can verify you are near the job site.',
        },
        { status: 400 }
      );
    }

    const sitePoint = await resolveTicketSitePointForVisitor(prisma, {
      companyJson: ticket.company as string | null,
      siteName: ticket.siteName as string | null,
      requesterId: ticket.requesterId as string | null,
    });
    if (!sitePoint) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This ticket has no job site coordinates. Add a pinned site location on the ticket or link the site in Sites before crew can join by proximity.',
        },
        { status: 400 }
      );
    }

    const distanceM = haversineDistanceMeters(clientPos, sitePoint);
    if (distanceM > effectiveRadiusM) {
      return NextResponse.json(
        {
          success: false,
          message: `You are about ${Math.round(distanceM)}m from the job site. Move within ${effectiveRadiusM}m (your workspace proximity limit) to join as crew.`,
        },
        { status: 403 }
      );
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
            vars: {
              name: displayName,
              ticketId,
              distanceM: String(Math.round(distanceM)),
              radiusM: String(effectiveRadiusM),
            },
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
