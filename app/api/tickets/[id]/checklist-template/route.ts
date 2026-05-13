import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { hasPrivilege } from '@/lib/coordinator-access';
import { ensureLegacyRequesterCompany } from '@/lib/ensure-legacy-requester-company';

const prisma = _prisma as any;

const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];

function parseCompany(company: string | null): Record<string, unknown> {
  if (!company || typeof company !== 'string') return {};
  try {
    return JSON.parse(company) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }

  const { id: ticketId } = await params;
  if (!ticketId) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const checklistTemplateId =
      typeof body.checklistTemplateId === 'string' ? body.checklistTemplateId.trim() : '';
    if (!checklistTemplateId) {
      return NextResponse.json({ success: false, message: 'checklistTemplateId is required' }, { status: 400 });
    }

    const coordinatorContext = await getCoordinatorContext(req);
    if (coordinatorContext) {
      const canEdit =
        hasPrivilege(coordinatorContext.privileges, 'MANAGE_CHECKLISTS') ||
        ['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(coordinatorContext.role);
      if (!canEdit) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      const row = await prisma.visitorRequest.findFirst({
        where: { id: ticketId, coordinatorCompanyId: coordinatorContext.companyId },
        select: { id: true, company: true, status: true, technique: true, checklistTemplateId: true },
      });
      if (!row) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }
      const tpl = await prisma.inspectionChecklist.findFirst({
        where: {
          id: checklistTemplateId,
          archived: false,
          OR: [{ companyId: coordinatorContext.companyId }, { companyId: null }],
        },
        select: { id: true },
      });
      if (!tpl) {
        return NextResponse.json({ success: false, message: 'Checklist template not found or not allowed' }, { status: 400 });
      }
      const parsed = parseCompany(row.company);
      parsed.checklistTemplateId = checklistTemplateId;
      if (!parsed._ticket) parsed._ticket = 1;
      await prisma.visitorRequest.update({
        where: { id: ticketId },
        data: { checklistTemplateId, company: JSON.stringify(parsed) },
      });
      return NextResponse.json({ success: true, checklistTemplateId });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { id: true, role: true },
    });
    if (!requester) {
      return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
    }
    const role = (requester.role ?? '').toUpperCase();
    const isFieldEngineer =
      role === 'ENGINEER' || role === 'QUALITY_ENGINEER' || role === 'SUPERVISION_ENGINEER';
    if (!isFieldEngineer) {
      return NextResponse.json({ success: false, message: 'Only engineers can attach a checklist template.' }, { status: 403 });
    }

    const row = await prisma.visitorRequest.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        company: true,
        status: true,
        technique: true,
        requesterId: true,
        checklistTemplateId: true,
        serviceSlug: true,
      },
    });
    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const tech = (row.technique ?? '').toLowerCase();
    if (MAINTENANCE_TECHNIQUES.includes(tech)) {
      return NextResponse.json(
        { success: false, message: 'Maintenance tickets do not use inspection checklist templates.' },
        { status: 400 }
      );
    }

    const parsed = parseCompany(row.company);
    let currentStatus = row.status ?? 'PENDING';
    if (parsed._ticket && typeof parsed.status === 'string') currentStatus = String(parsed.status);
    if (currentStatus === 'COMPLETED') {
      return NextResponse.json({ success: false, message: 'Cannot change checklist on a completed ticket.' }, { status: 400 });
    }

    const assigneeId =
      typeof parsed.assignedEngineerId === 'string' ? (parsed.assignedEngineerId as string) : null;
    if (assigneeId && assigneeId !== requester.id) {
      return NextResponse.json(
        { success: false, message: 'Only the assigned engineer can attach a checklist to this ticket.' },
        { status: 403 }
      );
    }
    if (!assigneeId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Assign yourself to this ticket first, then attach a checklist.',
        },
        { status: 400 }
      );
    }

    const companyScopeId = await ensureLegacyRequesterCompany(requester.id);
    if (!companyScopeId) {
      return NextResponse.json({ success: false, message: 'Could not resolve checklist workspace.' }, { status: 403 });
    }

    const tpl = await prisma.inspectionChecklist.findFirst({
      where: {
        id: checklistTemplateId,
        archived: false,
        OR: [{ companyId: companyScopeId }, { companyId: null }],
      },
      select: { id: true },
    });
    if (!tpl) {
      return NextResponse.json({ success: false, message: 'Checklist template not found or not allowed' }, { status: 400 });
    }

    parsed.checklistTemplateId = checklistTemplateId;
    if (!parsed._ticket) parsed._ticket = 1;

    await prisma.visitorRequest.update({
      where: { id: ticketId },
      data: { checklistTemplateId, company: JSON.stringify(parsed) },
    });

    return NextResponse.json({ success: true, checklistTemplateId });
  } catch (err) {
    console.error('PATCH /api/tickets/[id]/checklist-template:', err);
    return NextResponse.json({ success: false, message: 'Failed to update ticket checklist' }, { status: 500 });
  }
}
