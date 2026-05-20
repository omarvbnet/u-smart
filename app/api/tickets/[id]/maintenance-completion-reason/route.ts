import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';
import {
  MAINTENANCE_COMPLETION_REASON_ID_KEY,
  MAINTENANCE_COMPLETION_REASON_LABEL_KEY,
  loadMaintenanceReasonsForTicket,
  readMaintenanceCompletionReasonFromCompany,
  resolveMaintenanceReasonDepartmentId,
  validateMaintenanceCompletionReason,
} from '@/lib/private-company-maintenance-reasons';
import { resolveIsMaintenanceVisitorRequest } from '@/lib/maintenance-requester-confirmation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * PATCH /api/tickets/[id]/maintenance-completion-reason
 * Body: { maintenanceCompletionReasonId: string }
 * Field lead / crew while ticket is IN_PROGRESS.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      company: true,
      technique: true,
      privateCompanyId: true,
      privateCompanyTargetDepartmentId: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
  }

  const isMaint = await resolveIsMaintenanceVisitorRequest(
    prisma,
    ticket.technique,
    ticket.privateCompanyId
  );
  if (!isMaint) {
    return NextResponse.json({ success: false, message: 'Not a maintenance ticket' }, { status: 400 });
  }

  if (String(ticket.status).toUpperCase() !== 'IN_PROGRESS') {
    return NextResponse.json(
      { success: false, message: 'Completion reason can only be set while the ticket is in progress.' },
      { status: 400 }
    );
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    parsed = {};
  }

  const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
  const crewIds = maintenanceCrewIdsFromCompanyJson(parsed);
  const fieldActor =
    assignedId === auth.payload.requesterId || crewIds.includes(auth.payload.requesterId);
  if (!fieldActor) {
    return NextResponse.json(
      { success: false, message: 'Only the assigned lead or ticket crew can set the completion reason.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const deptId = await resolveMaintenanceReasonDepartmentId(ticket);
  const reasonCheck = await validateMaintenanceCompletionReason(
    ticket.privateCompanyId!,
    deptId,
    body.maintenanceCompletionReasonId
  );
  if (!reasonCheck.ok) {
    return NextResponse.json({ success: false, message: reasonCheck.message }, { status: 400 });
  }

  if (!parsed._ticket) parsed._ticket = true;
  if (reasonCheck.id) {
    parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY] = reasonCheck.id;
    parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY] = reasonCheck.label;
  } else {
    delete parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY];
    delete parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY];
  }

  await prisma.visitorRequest.update({
    where: { id },
    data: { company: JSON.stringify(parsed) },
  });

  const available = await loadMaintenanceReasonsForTicket(ticket);
  return NextResponse.json({
    success: true,
    maintenanceCompletionReasonId: reasonCheck.id || null,
    maintenanceCompletionReasonLabel: reasonCheck.label || null,
    availableMaintenanceCompletionReasons: available.map((r: { id: string; label: string }) => ({
      id: r.id,
      label: r.label,
    })),
    selected: readMaintenanceCompletionReasonFromCompany(parsed),
  });
}
