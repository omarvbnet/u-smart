import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const TICKET_STATUSES = ['PENDING', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED'] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let request: Awaited<ReturnType<typeof prisma.visitorRequest.findUnique>>;
    try {
      request = await prisma.visitorRequest.findUnique({
        where: { id },
        include: {
          requester: true,
          assignedTeam: { include: { leader: { select: { id: true, fullName: true, phone: true } }, members: { include: { employee: { select: { id: true, fullName: true } } } } } },
        },
      });
    } catch {
      // Client may not have assignedTeam until after migration + prisma generate
      request = await prisma.visitorRequest.findUnique({
        where: { id },
        include: { requester: true },
      });
    }
    if (!request) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, request });
  } catch (error) {
    const err = error as Error;
    console.error('GET /api/visitor-requests/[id]:', err?.message ?? err);
    return NextResponse.json({ success: false, message: 'Failed to fetch' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existingTicket = await prisma.visitorRequest.findUnique({
      where: { id },
      select: { status: true, company: true },
    });
    if (!existingTicket) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    const currentStatus = (existingTicket as { status?: string }).status ?? '';
    const parsedCompany = typeof existingTicket.company === 'string' ? (() => {
      try {
        const p = JSON.parse(existingTicket.company) as Record<string, unknown>;
        return p._ticket && typeof p.status === 'string' ? p.status : currentStatus;
      } catch {
        return currentStatus;
      }
    })() : currentStatus;
    const effectiveStatus = (parsedCompany || currentStatus || 'PENDING').toString().toUpperCase();
    if (effectiveStatus === 'COMPLETED') {
      return NextResponse.json(
        { success: false, message: 'Cannot edit or update a completed ticket' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
    const assignedTeamId = typeof body.assignedTeamId === 'string' ? body.assignedTeamId.trim() || null : undefined;
    const maintenanceDescription = typeof body.maintenanceDescription === 'string' ? body.maintenanceDescription.trim() : undefined;
    const beforeImageUrls = Array.isArray(body.beforeImageUrls) ? body.beforeImageUrls : undefined;
    const finishingImageUrls = Array.isArray(body.finishingImageUrls) ? body.finishingImageUrls : undefined;
    const inspectionResult = typeof body.inspectionResult === 'string' ? body.inspectionResult.trim().toLowerCase() : undefined;
    const inspectionComments = typeof body.inspectionComments === 'string' ? body.inspectionComments.trim() : undefined;
    const inspectionChecklist = Array.isArray(body.inspectionChecklist)
      ? body.inspectionChecklist.filter((c: unknown) => c && typeof c === 'object' && 'id' in c && 'label' in c && 'checked' in c).map((c: { id: string; label: string; checked: boolean; comment?: string; weight?: string }) => {
          const w = typeof (c as { weight?: string }).weight === 'string' && ((c as { weight: string }).weight === 'minor' || (c as { weight: string }).weight === 'major') ? (c as { weight: string }).weight : 'minor';
          return { id: c.id, label: c.label, checked: !!c.checked, comment: c.comment, weight: w };
        })
      : undefined;
    const ncrReason = typeof body.ncrReason === 'string' ? body.ncrReason.trim() : undefined;
    const ncrImageUrls = Array.isArray(body.ncrImageUrls) ? body.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : undefined;
    const ncrResubmit = body.ncrResubmit && typeof body.ncrResubmit === 'object'
      ? {
          comment: typeof body.ncrResubmit.comment === 'string' ? body.ncrResubmit.comment.trim() : '',
          imageUrls: Array.isArray(body.ncrResubmit.imageUrls) ? body.ncrResubmit.imageUrls.filter((u: unknown) => typeof u === 'string') : [],
        }
      : undefined;
    const ncrAction = body.ncrAction === 'accept' || body.ncrAction === 'resubmit' ? body.ncrAction : undefined;
    const ncrAdminComment = typeof body.ncrAdminComment === 'string' ? body.ncrAdminComment.trim() : undefined;
    const ncrAdminImageUrls = Array.isArray(body.ncrAdminImageUrls) ? body.ncrAdminImageUrls.filter((u: unknown) => typeof u === 'string') : undefined;

    // When setting status to IN_PROGRESS, require a team to be assigned (body or already on record)
    if (status === 'IN_PROGRESS') {
      let currentTeamId: string | null = null;
      try {
        const current = await (prisma as any).visitorRequest.findUnique({
          where: { id },
          select: { assignedTeamId: true },
        });
        currentTeamId = current?.assignedTeamId ?? null;
      } catch {
        // Prisma client may not have assignedTeamId until after migration + generate
      }
      const effectiveTeamId = assignedTeamId ?? currentTeamId;
      if (!effectiveTeamId) {
        return NextResponse.json(
          { success: false, message: 'Assign a team (with leader) before setting status to In Progress' },
          { status: 400 }
        );
      }
    }

    if (status && !TICKET_STATUSES.includes(status as typeof TICKET_STATUSES[number])) {
      return NextResponse.json(
        { success: false, message: 'Invalid status' },
        { status: 400 }
      );
    }
    if (inspectionResult === 'ncr' && !ncrAction && !ncrResubmit) {
      const reason = typeof ncrReason === 'string' ? ncrReason.trim() : '';
      if (!reason) {
        return NextResponse.json(
          { success: false, message: 'NCR reason is required when result is NCR' },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.visitorRequest.findUnique({ where: { id }, select: { company: true } });
    let companyPayload: string | undefined;
    let effectiveStatus = status;
    if (existing?.company && typeof existing.company === 'string') {
      try {
        const parsed = JSON.parse(existing.company) as Record<string, unknown>;
        if (parsed._ticket) {
          // NCR flow: requester resubmits
          if (ncrResubmit !== undefined) {
            const list = Array.isArray(parsed.ncrResubmissions) ? (parsed.ncrResubmissions as Array<Record<string, unknown>>) : [];
            list.push({
              at: new Date().toISOString(),
              by: 'requester',
              comment: ncrResubmit.comment || null,
              imageUrls: ncrResubmit.imageUrls || [],
              action: 'resubmit',
            });
            parsed.ncrResubmissions = list;
            companyPayload = JSON.stringify(parsed);
          }
          // NCR flow: admin accepts (close ticket)
          else if (ncrAction === 'accept') {
            const list = Array.isArray(parsed.ncrResubmissions) ? (parsed.ncrResubmissions as Array<Record<string, unknown>>) : [];
            list.push({ at: new Date().toISOString(), by: 'admin', action: 'accept' });
            parsed.ncrResubmissions = list;
            parsed.status = 'COMPLETED';
            parsed.completedAt = new Date().toISOString();
            parsed.inspectionResult = 'accepted';
            companyPayload = JSON.stringify(parsed);
            effectiveStatus = 'COMPLETED';
          }
          // NCR flow: admin resubmits (send back to requester with comment/photos)
          else if (ncrAction === 'resubmit') {
            const list = Array.isArray(parsed.ncrResubmissions) ? (parsed.ncrResubmissions as Array<Record<string, unknown>>) : [];
            list.push({
              at: new Date().toISOString(),
              by: 'admin',
              comment: ncrAdminComment || null,
              imageUrls: ncrAdminImageUrls || [],
              action: 'resubmit',
            });
            parsed.ncrResubmissions = list;
            companyPayload = JSON.stringify(parsed);
          }
          // Normal inspection save (including NCR with reason + images)
          else {
            if (status) parsed.status = status;
            if (inspectionResult !== undefined) parsed.inspectionResult = inspectionResult || null;
            if (inspectionComments !== undefined) parsed.inspectionComments = inspectionComments || null;
            if (inspectionChecklist !== undefined) parsed.inspectionChecklist = inspectionChecklist || [];
            if (ncrReason !== undefined) parsed.ncrReason = ncrReason || null;
            if (ncrImageUrls !== undefined) parsed.ncrImageUrls = ncrImageUrls || [];
            if (inspectionResult === 'ncr') {
              parsed.status = 'IN_PROGRESS';
              effectiveStatus = 'IN_PROGRESS';
              if (!parsed.ncrResubmissions) parsed.ncrResubmissions = [];
            }
            if (effectiveStatus === 'COMPLETED') {
              parsed.completedAt = new Date().toISOString();
            }
            companyPayload = JSON.stringify(parsed);
          }
        }
      } catch {
        /* ignore */
      }
    }

    type UpdatePayload = {
      status?: 'PENDING' | 'ON_SITE' | 'IN_PROGRESS' | 'COMPLETED';
      company?: string;
      completedAt?: Date;
      assignedTeamId?: string | null;
      assignedAt?: Date | null;
      maintenanceDescription?: string | null;
      beforeImageUrls?: unknown;
      finishingImageUrls?: unknown;
    };
    const updateData: UpdatePayload = {};
    if (effectiveStatus) updateData.status = effectiveStatus as 'PENDING' | 'ON_SITE' | 'IN_PROGRESS' | 'COMPLETED';
    if (companyPayload) updateData.company = companyPayload;
    if (effectiveStatus === 'COMPLETED') updateData.completedAt = new Date();
    if (assignedTeamId !== undefined) {
      updateData.assignedTeamId = assignedTeamId;
      updateData.assignedAt = assignedTeamId ? new Date() : null;
    }
    if (maintenanceDescription !== undefined) updateData.maintenanceDescription = maintenanceDescription;
    if (beforeImageUrls !== undefined) updateData.beforeImageUrls = beforeImageUrls;
    if (finishingImageUrls !== undefined) updateData.finishingImageUrls = finishingImageUrls;

    if (Object.keys(updateData).length === 0) {
      let req: Awaited<ReturnType<typeof prisma.visitorRequest.findUnique>>;
      try {
        req = await prisma.visitorRequest.findUnique({
          where: { id },
          include: { requester: true, assignedTeam: { include: { leader: { select: { id: true, fullName: true, phone: true } } } } },
        });
      } catch {
        req = await prisma.visitorRequest.findUnique({
          where: { id },
          include: { requester: true },
        });
      }
      if (!req) {
        return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, request: req });
    }

    let updated;
    try {
      updated = await prisma.visitorRequest.update({
        where: { id },
        data: updateData as Parameters<typeof prisma.visitorRequest.update>[0]['data'],
        include: { requester: true, assignedTeam: { include: { leader: { select: { id: true, fullName: true, phone: true } } } } },
      });
      const db = prisma as unknown as { ticketStatusLog?: { create: (args: { data: { visitorRequestId: string; status: string } }) => Promise<unknown> } };
      if (status && db.ticketStatusLog?.create) {
        await db.ticketStatusLog.create({
          data: { visitorRequestId: id, status: status as 'PENDING' | 'ON_SITE' | 'IN_PROGRESS' | 'COMPLETED' },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Unknown field') || msg.includes('completedAt')) {
        const fallback: Record<string, unknown> = { ...updateData };
        delete fallback.assignedTeamId;
        delete fallback.assignedAt;
        delete fallback.maintenanceDescription;
        delete fallback.beforeImageUrls;
        delete fallback.finishingImageUrls;
        delete fallback.completedAt;
        if (status) (fallback as Record<string, unknown>).status = status;
        if (companyPayload) fallback.company = companyPayload;
        if (status === 'COMPLETED') fallback.completedAt = new Date();
        updated = await prisma.visitorRequest.update({
          where: { id },
          data: fallback as Parameters<typeof prisma.visitorRequest.update>[0]['data'],
          include: { requester: true },
        });
      } else {
        throw err;
      }
    }

    // Notify requester when status changes
    try {
      if (updated.requesterId && updated.requester) {
        const statusLabels: Record<string, string> = {
          PENDING: 'Pending',
          ON_SITE: 'We are on site',
          IN_PROGRESS: 'In progress',
          COMPLETED: 'Completed',
        };
        await prisma.notification.create({
          data: {
            type: 'status_changed',
            title: 'Ticket status updated',
            message: `Your ticket status is now: ${statusLabels[status] || status}`,
            ticketId: id,
            requesterId: updated.requesterId,
            forAdmin: false,
          },
        });
      }
    } catch (e) {
      console.error('Create status notification:', e);
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    const err = error as Error;
    console.error('PATCH /api/visitor-requests/[id]:', err?.message ?? err);
    return NextResponse.json(
      { success: false, message: 'Failed to update' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
