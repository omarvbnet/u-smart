import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import {
  STAFF_LIVE_LOCATION_STALE_MS,
  staffLiveLocationDisplayName,
  type StaffLiveLocationRow,
} from '@/lib/staff-live-locations';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
} from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ACTIVE_STATUSES = new Set(['PENDING', 'ON_SITE', 'IN_PROGRESS']);

/**
 * Live locations of staff currently assigned to a ticket (lead + crew).
 * Visible to:
 *  - The ticket requester (individual or company role) when the ticket is active.
 *  - Workspace staff who are part of the ticket (lead, crew).
 *  - Workspace owners / managers / coordinators.
 *
 * Returns only stale-pruned, identified pings.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Ticket id required' },
      { status: 400 }
    );
  }
  try {
    const ticket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        company: true,
        requesterId: true,
        privateCompanyId: true,
      },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 }
      );
    }
    const status = String(ticket.status ?? '').toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) {
      return NextResponse.json({ success: true, locations: [] });
    }

    const parsed = parseTicketCompanyJson(ticket.company);
    const leadId = assignedStaffIdFromCompanyJson(parsed);
    const crewIds = maintenanceCrewIdsFromCompanyJson(parsed);
    const staffIds = Array.from(new Set([leadId, ...crewIds].filter(Boolean) as string[]));
    if (staffIds.length === 0) {
      return NextResponse.json({ success: true, locations: [] });
    }

    // Authorization
    const isRequester = ticket.requesterId === auth.payload.requesterId;
    let allowed = isRequester;
    if (!allowed && staffIds.includes(auth.payload.requesterId)) allowed = true;

    if (!allowed && ticket.privateCompanyId) {
      try {
        const me = await prisma.ticketRequester.findUnique({
          where: { id: auth.payload.requesterId },
          select: {
            role: true,
            privateCompanyId: true,
            privateCompanyOwned: { select: { id: true, status: true } },
          },
        });
        const r = String(me?.role ?? '').toUpperCase();
        const inSameWorkspace = me?.privateCompanyId === ticket.privateCompanyId;
        const isOwner =
          me?.privateCompanyOwned?.id === ticket.privateCompanyId &&
          (me?.privateCompanyOwned?.status ?? 'PENDING') === 'APPROVED';
        if (
          isOwner ||
          (inSameWorkspace && (r === 'MANAGER' || r === 'COORDINATOR'))
        ) {
          allowed = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (!allowed) {
      return NextResponse.json(
        { success: false, message: 'Forbidden' },
        { status: 403 }
      );
    }

    const since = new Date(Date.now() - STAFF_LIVE_LOCATION_STALE_MS);
    const rows = (await prisma.staffLiveLocation.findMany({
      where: {
        requesterId: { in: staffIds },
        updatedAt: { gte: since },
      },
      include: {
        requester: {
          select: {
            name: true,
            username: true,
            role: true,
            privateCompanyDepartment: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })) as StaffLiveLocationRow[];

    return NextResponse.json({
      success: true,
      locations: rows.map((row) => ({
        requesterId: row.requesterId,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        updatedAt: row.updatedAt.toISOString(),
        role: row.requester?.role ?? null,
        departmentName: row.requester?.privateCompanyDepartment?.name ?? null,
        name: staffLiveLocationDisplayName(row),
      })),
    });
  } catch (err) {
    console.error('GET /api/tickets/[id]/live-staff:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load live staff' },
      { status: 500 }
    );
  }
}
