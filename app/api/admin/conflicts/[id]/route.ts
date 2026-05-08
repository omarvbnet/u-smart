import type { TicketStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';
import { rowToConflictPayload, isConflictInspectionLowercase } from '@/lib/qc-conflict-mapper';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { sendConflictResolutionEmail } from '@/lib/email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * Admin-only conflict resolution. Body:
 *   { resolution: 'keep_same' | 're_inspection' | 'accepted' | 'accepted_with_comments' | 'not_accepted' | 'ncr' | 're_maintain' | 'no_need',
 *     comment?: string }
 *
 * Behavior:
 *   - keep_same   → conflictStatus = resolved (inspectionResult unchanged, ticket status unchanged)
 *   - re_inspection / re_maintain → ticket status reset to IN_PROGRESS / PENDING; previous inspection moved to history
 *   - any other resolution → conflictStatus = resolved AND inspectionResult overwritten with the new value
 *
 * Notifies the requester (ticket owner) AND the assigned engineer/handler via in-app + push + email.
 */

const VALID_RESOLUTIONS = [
  'keep_same',
  're_inspection',
  'accepted',
  'accepted_with_comments',
  'not_accepted',
  'ncr',
  're_maintain',
  'no_need',
] as const;
type Resolution = (typeof VALID_RESOLUTIONS)[number];

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.role !== 'ADMIN') return null;
  return payload;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  const row = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      technique: true,
      status: true,
      serviceSlug: true,
      updatedAt: true,
      requesterId: true,
    },
  });
  if (!row) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }
  const conflict = rowToConflictPayload(row);
  if (!conflict) {
    return NextResponse.json(
      { success: false, message: 'This ticket does not have an active conflict.' },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, conflict });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, message: 'Admin privileges required' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID is required.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const resolutionRaw = typeof body?.resolution === 'string' ? body.resolution.trim() : '';
  const resolution = (VALID_RESOLUTIONS as readonly string[]).includes(resolutionRaw)
    ? (resolutionRaw as Resolution)
    : null;
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
  if (!resolution) {
    return NextResponse.json(
      { success: false, message: `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(', ')}.` },
      { status: 400 }
    );
  }

  const ticket = await prisma.visitorRequest.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      technique: true,
      status: true,
      requesterId: true,
      serviceSlug: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ success: false, message: 'Ticket not found.' }, { status: 404 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
  } catch {
    return NextResponse.json({ success: false, message: 'Ticket data is corrupted.' }, { status: 500 });
  }

  // Some tickets only mark conflictReported once a customer reports the result.
  // Tolerate: an admin can still resolve if the ticket is COMPLETED with a conflict-grade result.
  if (parsed.conflictReported !== true) {
    const ir = ((parsed.inspectionResult as string) ?? '').toLowerCase();
    if (ticket.status === 'COMPLETED' && isConflictInspectionLowercase(ir)) {
      parsed.conflictReported = true;
      parsed.conflictStatus = parsed.conflictStatus ?? 'pending';
    } else {
      return NextResponse.json(
        { success: false, message: 'This ticket has no reported conflict to resolve.' },
        { status: 400 }
      );
    }
  }

  const isReinspection = resolution === 're_inspection';
  const isReMaintain = resolution === 're_maintain';
  const isMaintenance = resolution === 're_maintain' || resolution === 'no_need';
  const isOverride =
    resolution === 'accepted' ||
    resolution === 'accepted_with_comments' ||
    resolution === 'not_accepted' ||
    resolution === 'ncr';
  const previousResult = (parsed.inspectionResult as string) ?? null;

  parsed.conflictStatus = isReinspection ? 're_inspection' : 'resolved';
  parsed.conflictResolvedByAdmin = admin.userId;
  parsed.conflictResolvedAt = new Date().toISOString();
  parsed.conflictResolution = resolution;
  if (comment) parsed.conflictResolutionComment = comment;

  let newTicketStatus: TicketStatus | null = null;

  if (isReinspection) {
    const checklistHistory = Array.isArray(parsed.checklistHistory) ? parsed.checklistHistory : [];
    if (parsed.inspectionChecklist || parsed.inspectionResult || parsed.inspectionComments) {
      checklistHistory.push({
        at: new Date().toISOString(),
        inspectionChecklist: parsed.inspectionChecklist ?? [],
        inspectionResult: parsed.inspectionResult ?? null,
        inspectionComments: parsed.inspectionComments ?? null,
        triggeredBy: 'admin_conflict_resolution',
      });
    }
    parsed.checklistHistory = checklistHistory;
    parsed.inspectionResult = null;
    parsed.inspectionComments = null;
    parsed.inspectionChecklist = null;
    parsed.checklistResponse = null;
    parsed.status = 'IN_PROGRESS';
    newTicketStatus = 'IN_PROGRESS';
  } else if (isReMaintain) {
    parsed.status = 'PENDING';
    newTicketStatus = 'PENDING';
  } else if (isOverride) {
    parsed.inspectionResult = resolution;
  }
  // keep_same / no_need leave inspectionResult untouched.

  const updateData: { company: string; status?: TicketStatus; completedAt?: null } = {
    company: JSON.stringify(parsed),
  };
  if (newTicketStatus) {
    updateData.status = newTicketStatus;
    updateData.completedAt = null;
  }

  await prisma.visitorRequest.update({ where: { id }, data: updateData });

  if (newTicketStatus === 'IN_PROGRESS' || newTicketStatus === 'PENDING') {
    try {
      await prisma.ticketStatusLog.create({
        data: { visitorRequestId: id, status: newTicketStatus },
      });
    } catch {
      /* table may not exist yet */
    }
  }

  // ─── Recipients ─────────────────────────────────────────────────────────
  const recipientIds = new Set<string>();
  if (ticket.requesterId) recipientIds.add(ticket.requesterId);
  const handlerId =
    typeof parsed.assignedEngineerId === 'string' && parsed.assignedEngineerId
      ? (parsed.assignedEngineerId as string)
      : null;
  if (handlerId) recipientIds.add(handlerId);

  const siteName = (parsed.siteName as string) ?? '';

  // In-app + push (i18n)
  for (const requesterId of recipientIds) {
    try {
      if (isReinspection) {
        await notifyRequesterI18n({
          prisma,
          type: 'conflict_reinspection',
          ticketId: id,
          requesterId,
          payload: { key: 'conflict_reinspection', vars: { siteName } },
          data: { ticketId: id, type: 'conflict_reinspection' },
        });
      } else {
        const resultKey = isMaintenance
          ? resolution
          : isOverride
            ? resolution
            : (previousResult ?? 'accepted');
        await notifyRequesterI18n({
          prisma,
          type: 'conflict_resolved',
          ticketId: id,
          requesterId,
          payload: { key: 'conflict_resolved', vars: { siteName, resultKey } },
          data: { ticketId: id, type: 'conflict_resolved', resolution },
        });
      }
    } catch (e) {
      console.error('notifyRequesterI18n (conflict admin):', e);
    }
  }

  // Email — fan out in parallel, but tolerant of missing addresses
  try {
    const recipientRows = (await prisma.ticketRequester.findMany({
      where: { id: { in: [...recipientIds] } },
      select: { id: true, email: true },
    })) as Array<{ id: string; email: string | null }>;
    await Promise.all(
      recipientRows
        .filter((r) => r.email && r.email.trim())
        .map((r) =>
          sendConflictResolutionEmail({
            to: r.email!.trim(),
            recipientRole: r.id === ticket.requesterId ? 'requester' : 'engineer',
            ticketId: id,
            siteName,
            resolution,
            comment: comment || null,
            newStatus: newTicketStatus,
          }).catch((e) => console.error('Conflict email send:', e))
        )
    );
  } catch (e) {
    console.error('Conflict email recipient fetch:', e);
  }

  // Admin audit notification (visible in admin notifications inbox if used)
  try {
    if (typeof prisma.notification?.create === 'function') {
      await prisma.notification.create({
        data: {
          type: 'conflict_resolved_admin',
          title: isReinspection ? 'Re-inspection ordered' : 'Conflict resolved',
          message: `Ticket #${id.slice(-8)} — ${resolution}${comment ? ` · ${comment}` : ''}`,
          ticketId: id,
          forAdmin: true,
        },
      });
    }
  } catch (e) {
    console.error('Admin audit notification:', e);
  }

  const conflict = rowToConflictPayload({
    ...ticket,
    company: JSON.stringify(parsed),
  });

  return NextResponse.json({
    success: true,
    conflict,
    notifiedRequesterIds: [...recipientIds],
    newStatus: newTicketStatus,
  });
}
