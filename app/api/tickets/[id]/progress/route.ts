import { NextRequest, NextResponse } from 'next/server';
import { resolveChecklistItemSeverity } from '@/lib/checklist-item-severity';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * PATCH /api/tickets/[id]/progress
 *
 * Lightweight autosave for in-progress field work. Persists the staff's current
 * checklist selections and/or draft before/after photos WITHOUT completing the
 * ticket or changing its status. Lets staff leave the screen / app and come back
 * (and makes selections visible on the shared web link before completion).
 *
 * Body: { checklistTemplateId?, checklistItems?: [...], beforeImageUrls?: [...], finishingImageUrls?: [...] }
 * Auth: the assigned lead, a ticket crew member, or the assigned coordinator.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const coordinatorContext = await getCoordinatorContext(req);
    const ticket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        company: true,
        coordinatorCompanyId: true,
        assigneeCoordinatorUserId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    } catch {
      /* ignore */
    }

    // Authorize: assigned lead / crew member, or assigned coordinator.
    const assignedId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
    const crewIds = maintenanceCrewIdsFromCompanyJson(parsed);
    const isLead = assignedId === auth.payload.requesterId;
    const isCrewMember = !isLead && crewIds.includes(auth.payload.requesterId);
    const fieldActor = isLead || isCrewMember;
    const assignedCoordinatorId =
      ticket.assigneeCoordinatorUserId ??
      (typeof parsed.assigneeCoordinatorUserId === 'string' ? parsed.assigneeCoordinatorUserId : null);
    if (coordinatorContext) {
      if (ticket.coordinatorCompanyId !== coordinatorContext.companyId) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      if (assignedCoordinatorId && assignedCoordinatorId !== coordinatorContext.userId) {
        return NextResponse.json(
          { success: false, message: 'Only assigned staff can update this ticket' },
          { status: 403 }
        );
      }
    } else if (!fieldActor) {
      return NextResponse.json(
        { success: false, message: 'Only the assigned lead or ticket crew can update this ticket' },
        { status: 403 }
      );
    }

    if (ticket.status === 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Ticket is already completed' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // Checklist template (optional)
    let templateChanged = false;
    if (typeof body.checklistTemplateId === 'string' && body.checklistTemplateId.trim()) {
      parsed.checklistTemplateId = body.checklistTemplateId.trim();
      templateChanged = true;
    }

    // Checklist item selections (optional, draft — no completion)
    if (Array.isArray(body.checklistItems)) {
      parsed.inspectionChecklist = body.checklistItems.map((item: Record<string, unknown>) => {
        const severity = resolveChecklistItemSeverity(item);
        return {
          id: String(item.id ?? ''),
          label: String(item.label ?? ''),
          checked: !!item.checked,
          result: typeof item.result === 'string' ? item.result : item.checked ? 'accepted' : 'rejected',
          comment:
            typeof item.comment === 'string'
              ? item.comment
              : typeof item.note === 'string'
                ? item.note
                : undefined,
          weight: severity,
          severity,
        };
      });
    }

    // Draft before / after images (optional — no 4-6 validation while drafting)
    const beforeUrls = Array.isArray(body.beforeImageUrls)
      ? body.beforeImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim())
      : null;
    const afterUrls = Array.isArray(body.finishingImageUrls)
      ? body.finishingImageUrls.filter((u: unknown) => typeof u === 'string' && String(u).trim())
      : null;
    if (beforeUrls) parsed.beforeImageUrls = beforeUrls;
    if (afterUrls) parsed.finishingImageUrls = afterUrls;

    if (!parsed._ticket) parsed._ticket = true;

    const updateData: Record<string, unknown> = { company: JSON.stringify(parsed) };
    if (templateChanged) updateData.checklistTemplateId = parsed.checklistTemplateId;
    if (beforeUrls) updateData.beforeImageUrls = beforeUrls;
    if (afterUrls) updateData.finishingImageUrls = afterUrls;

    try {
      await prisma.visitorRequest.update({ where: { id }, data: updateData });
    } catch (err) {
      // Legacy DB missing optional columns: persist the JSON blob only.
      const e = err as { code?: string; message?: string };
      const isMissingColumn =
        e?.code === 'P2022' || /column .* does not exist/i.test(e?.message ?? '');
      if (isMissingColumn) {
        await prisma.visitorRequest.update({
          where: { id },
          data: { company: JSON.stringify(parsed) },
        });
      } else {
        throw err;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/tickets/[id]/progress:', error);
    return NextResponse.json({ success: false, message: 'Failed to save progress' }, { status: 500 });
  }
}
