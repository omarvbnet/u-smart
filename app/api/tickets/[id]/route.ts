import { NextRequest, NextResponse } from 'next/server';
import { prisma as _prisma } from '@/lib/prisma';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { viewerHasSharedSiteTicketRead, visitorRequestSiteLogicalId } from '@/lib/site-share-access';
import { resolveInspectionChecklistTemplate, resolveTicketSiteCoordinates, embeddedTicketSiteCoords } from '@/lib/ticket-detail-enrichment';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';
import { MAINTENANCE_TECHNIQUES } from '@/lib/qc-conflict-mapper';
import { assertTechnicianMaintenanceTicketDetailAccess } from '@/lib/technician-maintenance-ticket-access';
import {
  assertEngineerWorkspaceTicketDetailAccess,
  isWorkspaceEngineerRole,
} from '@/lib/workspace-task-assignment';
import { isWorkspaceCrewTicketTechnique } from '@/lib/workspace-maintenance-crew';
import {
  expenseRowToJson,
  loadExpenseSettings,
  resolveEffectiveTicketExpensePolicy,
  serializeExpenseSettings,
} from '@/lib/private-company-expenses';
import { loadPlatformTicketPolicy } from '@/lib/platform-ticket-policy';
import { readCancellationFromParsed } from '@/lib/ticket-cancellation';
import { readResubmitMeta, totalResubmissionHoursFromParsed } from '@/lib/ticket-resubmit';
import {
  tryAutoConfirmExpiredMaintenanceAwaiting,
  readMaintenanceAwaitingSince,
  readMaintenanceRejectReason,
  MAINTENANCE_REQUESTER_CONFIRMED_AT_KEY,
} from '@/lib/maintenance-requester-confirmation';
import { parseQFieldProjectsFromCompanyJson, type QFieldProjectStored } from '@/lib/qfield-projects';
import { isWorkspaceTicketLeader } from '@/lib/private-company-ticket-visibility';
import {
  loadMaintenanceReasonsForTicket,
  readMaintenanceCompletionReasonFromCompany,
} from '@/lib/private-company-maintenance-reasons';
import { readWithdrawalRequest } from '@/lib/ticket-field-withdrawal';

const prisma = _prisma as any;

type TimelineEntryOut = { status: string; createdAt: string; detail?: string | null };

function timelineIso(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  const t = Date.parse(String(d));
  return Number.isFinite(t) ? new Date(t).toISOString() : String(d);
}

/** Merge status logs with NCR / workflow resubmits and maintenance requester confirmation. */
function buildEnrichedStatusTimeline(args: {
  logs: { status: string; createdAt: Date }[];
  fallbackStatus: string;
  fallbackAt: Date;
  ncrResubmissions: Array<{ at?: string; by?: string; action?: string; comment?: string | null }>;
  resubmittedAt: string | null;
  resubmitReason: string | null;
  maintenanceRequesterConfirmedAt: string | null;
}): TimelineEntryOut[] {
  const out: TimelineEntryOut[] = [];
  if (args.logs.length > 0) {
    for (const e of args.logs) {
      out.push({ status: e.status, createdAt: timelineIso(e.createdAt), detail: null });
    }
  } else {
    out.push({ status: args.fallbackStatus, createdAt: timelineIso(args.fallbackAt), detail: null });
  }

  const pushUnique = (status: string, atRaw: string | null | undefined, detail?: string | null) => {
    const a = typeof atRaw === 'string' ? atRaw.trim() : '';
    if (!a) return;
    const t = Date.parse(a);
    if (!Number.isFinite(t)) return;
    const createdAt = new Date(t).toISOString();
    const key = `${status}|${createdAt}`;
    if (out.some((x) => `${x.status}|${x.createdAt}` === key)) return;
    out.push({ status, createdAt, detail: detail ?? null });
  };

  for (const r of args.ncrResubmissions) {
    const parts = [r.by, r.action, r.comment].filter(
      (x): x is string => typeof x === 'string' && Boolean(x.trim())
    );
    pushUnique('RESUBMISSION', r.at, parts.length ? parts.join(' · ') : null);
  }

  if (args.resubmittedAt) {
    const t0 = Date.parse(args.resubmittedAt);
    const dupNcr =
      Number.isFinite(t0) &&
      args.ncrResubmissions.some((r) => {
        const t1 = typeof r.at === 'string' ? Date.parse(r.at) : NaN;
        return Number.isFinite(t1) && Math.abs(t1 - t0) < 4000;
      });
    if (!dupNcr) {
      pushUnique('RESUBMISSION', args.resubmittedAt, args.resubmitReason ?? null);
    }
  }

  pushUnique('REQUESTER_CONFIRMED', args.maintenanceRequesterConfirmedAt, null);

  out.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return out;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const payload = auth.payload;
  const coordinatorContext = await getCoordinatorContext(req);

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, message: 'Ticket ID required' }, { status: 400 });
  }

  await tryAutoConfirmExpiredMaintenanceAwaiting(prisma, id);

  // Coordinator-role access (new provider account system)
  if (coordinatorContext) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const whereClause: any = { id, coordinatorCompanyId: coordinatorContext.companyId };
      if (coordinatorContext.role === 'QUALITY_ENGINEER') whereClause.taskCategory = 'QUALITY';
      if (coordinatorContext.role === 'SUPERVISION_ENGINEER') whereClause.taskCategory = 'SUPERVISION';
      if (coordinatorContext.role === 'TECHNICIAN') whereClause.taskCategory = 'MAINTENANCE';

      const row = await prisma.visitorRequest.findFirst({
        where: whereClause,
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          completedAt: true,
          taskCategory: true,
          roleScope: true,
          workflowState: true,
          assignmentScope: true,
          checklistTemplateId: true,
          assigneeCoordinatorUserId: true,
          coordinatorCompanyId: true,
          resubmitReason: true,
          resubmittedAt: true,
          requesterId: true,
        },
      });
      if (!row) {
        return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
      }

      let siteName: string | null = null;
      let siteCoordinator: string | null = null;
      let slaHours: number | null = null;
      let status = row.status ?? 'PENDING';
      let embeddedChecklistTemplateId: string | null = null;
      let parsedCompany: unknown = {};
      let qfieldProjectsCoordinator: QFieldProjectStored[] = [];
      try {
        parsedCompany = typeof row.company === 'string' ? JSON.parse(row.company) : {};
        const parsed = parsedCompany as Record<string, unknown>;
        if (parsed._ticket) {
          siteName = (parsed.siteName as string) ?? null;
          siteCoordinator = (parsed.siteCoordinator as string) ?? null;
          slaHours = (parsed.slaHours as number) ?? null;
          if (parsed.status) status = String(parsed.status);
          if (typeof parsed.checklistTemplateId === 'string' && parsed.checklistTemplateId.trim()) {
            embeddedChecklistTemplateId = parsed.checklistTemplateId.trim();
          }
          qfieldProjectsCoordinator = parseQFieldProjectsFromCompanyJson(parsed);
        }
      } catch {
        /* ignore */
      }

      const effectiveTemplateId = row.checklistTemplateId ?? embeddedChecklistTemplateId;
      const embedCoords = embeddedTicketSiteCoords(parsedCompany);
      const [siteCoords, checklistTpl] = await Promise.all([
        resolveTicketSiteCoordinates(prisma, siteName, row.requesterId ?? null),
        resolveInspectionChecklistTemplate(prisma, effectiveTemplateId),
      ]);
      const mergedCoords =
        Object.keys(embedCoords).length > 0 ? embedCoords : siteCoords;

      let platformCancellationReasons: string[] = [];
      let platformResubmitReasons: string[] = [];
      try {
        const policy = await loadPlatformTicketPolicy();
        platformCancellationReasons = policy.cancellationReasons;
        platformResubmitReasons = policy.resubmitReasons;
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        success: true,
        ticket: {
          id: row.id,
          siteName,
          siteCoordinator,
          slaHours,
          technique: row.technique,
          status,
          createdAt: row.createdAt,
          completedAt: row.completedAt ?? null,
          taskCategory: row.taskCategory ?? null,
          roleScope: row.roleScope ?? null,
          workflowState: row.workflowState ?? 'OPEN',
          assignmentScope: row.assignmentScope ?? null,
          checklistTemplateId: checklistTpl.checklistTemplateId ?? row.checklistTemplateId ?? null,
          checklistTemplate: checklistTpl.checklistTemplate,
          ...mergedCoords,
          assigneeCoordinatorUserId: row.assigneeCoordinatorUserId ?? null,
          coordinatorCompanyId: row.coordinatorCompanyId ?? null,
          resubmitReason: row.resubmitReason ?? null,
          resubmittedAt: row.resubmittedAt ?? null,
          requesterId: row.requesterId ?? null,
          qfieldProjects: qfieldProjectsCoordinator,
          platformCancellationReasons,
          platformResubmitReasons,
        },
      });
    } catch (err) {
      console.error('GET /api/tickets/[id] coordinator flow:', err);
      return NextResponse.json(
        { success: false, message: 'Failed to load ticket' },
        { status: 500 }
      );
    }
  }

  // Determine requester role to decide access rules
  let requesterRole = 'COMPANY';
  try {
    const reqRow = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { role: true },
    });
    requesterRole = reqRow?.role ?? 'COMPANY';
  } catch { /* fallback to COMPANY */ }

  try {
    // ENGINEER: QC tickets + workspace-scoped maintenance (dispatch / triage). TECHNICIAN: maintenance. COMPANY/PERSONAL: own tickets only.
    let engineerWorkspaceId: string | null = null;
    let ownedPrivateCompanyId: string | null = null;
    try {
      const meWs = await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: {
          privateCompanyId: true,
          privateCompanyOwned: { select: { id: true, status: true } },
        },
      });
      const owned =
        meWs?.privateCompanyOwned?.status === 'APPROVED' ? meWs.privateCompanyOwned?.id ?? null : null;
      ownedPrivateCompanyId = owned;
      engineerWorkspaceId = owned ?? meWs?.privateCompanyId ?? null;
    } catch {
      engineerWorkspaceId = null;
      ownedPrivateCompanyId = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let whereClause: any;
    const isQcPoolEngineer =
      requesterRole === 'ENGINEER' ||
      requesterRole === 'QUALITY_ENGINEER' ||
      requesterRole === 'SUPERVISION_ENGINEER' ||
      requesterRole === 'MANAGER' ||
      requesterRole === 'COORDINATOR';
    if (engineerWorkspaceId && isWorkspaceTicketLeader(requesterRole, ownedPrivateCompanyId)) {
      whereClause = { id, privateCompanyId: engineerWorkspaceId };
    } else if (isQcPoolEngineer) {
      whereClause = {
        id,
        OR: [
          { technique: { notIn: MAINTENANCE_TECHNIQUES } },
          ...(engineerWorkspaceId
            ? [
                {
                  technique: { in: MAINTENANCE_TECHNIQUES },
                  assignmentScope: 'PRIVATE_COMPANY_STAFF',
                  privateCompanyId: engineerWorkspaceId,
                },
              ]
            : []),
        ],
      };
    } else if (requesterRole === 'TECHNICIAN') {
      // Load by id; maintenance + workspace access are enforced after fetch so
      // workspace Provisor slugs and PRIVATE_COMPANY_STAFF rules match GET /api/tickets.
      whereClause = { id };
    } else if (requesterRole === 'WORKER') {
      whereClause = { id, company: { contains: payload.requesterId } };
    } else {
      whereClause = { id, requesterId: payload.requesterId };
    }

    let row: any;
    try {
      row = await prisma.visitorRequest.findFirst({
        where: whereClause,
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          completedAt: true,
          requesterId: true,
          checklistTemplateId: true,
          assignmentScope: true,
          privateCompanyId: true,
          privateCompanyTargetDepartmentId: true,
          province: true,
          workflowState: true,
          resubmitReason: true,
          resubmittedAt: true,
          requester: {
            select: { name: true, phone: true, role: true, username: true },
          },
          maintenanceDescription: true,
          beforeImageUrls: true,
          finishingImageUrls: true,
          assignedTeamId: true,
          assignedTeam: {
            select: {
              id: true,
              name: true,
              leader: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      });
    } catch (schemaErr) {
      row = await prisma.visitorRequest.findFirst({
        where: whereClause,
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          completedAt: true,
          requesterId: true,
          checklistTemplateId: true,
          assignmentScope: true,
          privateCompanyId: true,
          privateCompanyTargetDepartmentId: true,
          province: true,
        },
      });
    }

    if (row && requesterRole === 'TECHNICIAN') {
      const detailOk = await assertTechnicianMaintenanceTicketDetailAccess(
        prisma,
        payload.requesterId,
        engineerWorkspaceId,
        row
      );
      if (!detailOk) row = null;
    }

    if (row && isWorkspaceEngineerRole(requesterRole) && !isWorkspaceTicketLeader(requesterRole, ownedPrivateCompanyId)) {
      const engineerOk = await assertEngineerWorkspaceTicketDetailAccess(
        prisma,
        payload.requesterId,
        engineerWorkspaceId,
        row,
      );
      if (!engineerOk) row = null;
    }

    if (
      !row &&
      (requesterRole === 'COMPANY' || requesterRole === 'PERSONAL')
    ) {
      const candidate = await prisma.visitorRequest.findFirst({
        where: { id },
        select: { requesterId: true, siteName: true, company: true },
      });
      const siteLogical = visitorRequestSiteLogicalId(
        candidate ?? { siteName: null, company: null }
      );
      const sharedOk =
        candidate?.requesterId &&
        siteLogical &&
        (await viewerHasSharedSiteTicketRead(prisma, payload.requesterId, {
          requesterId: candidate.requesterId,
          siteName: siteLogical,
        }));
      if (sharedOk) {
        try {
          row = await prisma.visitorRequest.findFirst({
            where: { id },
            select: {
              id: true,
              technique: true,
              company: true,
              status: true,
              createdAt: true,
              completedAt: true,
              requesterId: true,
              checklistTemplateId: true,
              assignmentScope: true,
              requester: {
                select: { name: true, phone: true, role: true, username: true },
              },
              maintenanceDescription: true,
              beforeImageUrls: true,
              finishingImageUrls: true,
              assignedTeamId: true,
              assignedTeam: {
                select: {
                  id: true,
                  name: true,
                  leader: { select: { id: true, fullName: true, phone: true } },
                },
              },
            },
          });
        } catch {
          row = await prisma.visitorRequest.findFirst({
            where: { id },
            select: {
              id: true,
              technique: true,
              company: true,
              status: true,
              createdAt: true,
              completedAt: true,
              requesterId: true,
              checklistTemplateId: true,
              assignmentScope: true,
            },
          });
        }
      }
    }

    if (!row) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    let logs: { status: string; createdAt: Date }[] = [];
    try {
      logs = await prisma.ticketStatusLog.findMany({
        where: { visitorRequestId: id },
        orderBy: { createdAt: 'asc' },
        select: { status: true, createdAt: true },
      });
    } catch {
      /* ticketStatusLog may not exist in all schemas */
    }

    let siteName: string | null = null;
    let siteCoordinator: string | null = null;
    let slaHours: number | null = null;
    let companyName: string | null = null;
    let status = row.status ?? 'PENDING';
    let completedAt: string | null = row.completedAt ? String(row.completedAt) : null;
    let designSpecifications: string | null = null;
    let attachmentUrls: string[] = [];
    let qfieldProjects: QFieldProjectStored[] = [];
    let inspectionResult: string | null = null;
    let inspectionComments: string | null = null;
    let inspectionChecklist: Array<{ id: string; label: string; checked: boolean; result?: string; comment?: string }> = [];
    let ncrReason: string | null = null;
    let ncrImageUrls: string[] = [];
    let ncrResubmissions: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }> = [];
    let checklistHistory: Array<{ at: string; inspectionChecklist?: unknown[]; inspectionResult?: string }> = [];
    let conflictReported = false;
    let conflictStatus: string | null = null;
    let conflictResolution: string | null = null;
    let conflictReportComment: string | null = null;
    let conflictReportedAt: string | null = null;
    let conflictResolvedAt: string | null = null;
    let assignedEngineerId: string | null = null;
    let assignedEngineerName: string | null = null;
    let assignedAt: string | null = null;
    let maintenanceCrewIds: string[] = [];
    let embeddedChecklistTemplateId: string | null = null;
    let maintenanceAwaitingRequesterSince: string | null = null;
    let maintenanceRequesterRejectReason: string | null = null;
    let maintenanceRequesterConfirmedAt: string | null = null;
    let cancellationRequestStatus: string | null = null;
    let cancellationRequestedAt: string | null = null;
    let cancellationReason: string | null = null;
    let cancellationRejectedAt: string | null = null;
    let cancellationRejectionReason: string | null = null;
    let withdrawalRequest: ReturnType<typeof readWithdrawalRequest> = null;
    let workflowState: string | null = (row as { workflowState?: string | null }).workflowState ?? null;
    let resubmitReason: string | null = (row as { resubmitReason?: string | null }).resubmitReason ?? null;
    let resubmittedAt: string | null = (row as { resubmittedAt?: Date | null }).resubmittedAt
      ? String((row as { resubmittedAt: Date }).resubmittedAt)
      : null;
    let resubmitTarget: string | null = null;
    let resubmissionHours: number | null = null;
    let platformCancellationReasons: string[] = [];
    let platformResubmitReasons: string[] = [];
    try {
      const parsed = typeof row.company === 'string' ? JSON.parse(row.company) : {};
      if (parsed._ticket) {
        siteName = parsed.siteName ?? null;
        siteCoordinator = parsed.siteCoordinator ?? null;
        slaHours = parsed.slaHours ?? null;
        if (typeof parsed.checklistTemplateId === 'string' && parsed.checklistTemplateId.trim()) {
          embeddedChecklistTemplateId = parsed.checklistTemplateId.trim();
        }
        if (parsed.status) status = String(parsed.status);
        if (parsed.completedAt) completedAt = String(parsed.completedAt);
        designSpecifications = (parsed.designSpecifications as string) ?? null;
        attachmentUrls = Array.isArray(parsed.attachmentUrls) ? parsed.attachmentUrls.filter((u: unknown) => typeof u === 'string') : [];
        inspectionResult = (parsed.inspectionResult as string) ?? null;
        inspectionComments = (parsed.inspectionComments as string) ?? null;
        inspectionChecklist = Array.isArray(parsed.inspectionChecklist)
          ? parsed.inspectionChecklist
            .filter((c: unknown) => c && typeof c === 'object' && 'id' in c && 'label' in c && 'checked' in c)
            .map((c: { id: string; label: string; checked: boolean; comment?: string; weight?: string; result?: string }) => ({
              id: c.id,
              label: c.label,
              checked: !!c.checked,
              result: typeof c.result === 'string' ? c.result : (c.checked ? 'accepted' : 'rejected'),
              comment: c.comment,
              weight: c.weight === 'major' ? 'major' : 'minor',
            }))
          : [];
        ncrReason = (parsed.ncrReason as string) ?? null;
        ncrImageUrls = Array.isArray(parsed.ncrImageUrls) ? parsed.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];
        ncrResubmissions = Array.isArray(parsed.ncrResubmissions)
          ? (parsed.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({
              at: e.at || '',
              by: e.by || '',
              action: e.action || 'resubmit',
              comment: e.comment ?? null,
              imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [],
            }))
          : [];
        assignedEngineerId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
        assignedEngineerName = typeof parsed.assignedEngineerName === 'string' ? parsed.assignedEngineerName : null;
        assignedAt = typeof parsed.assignedAt === 'string' ? parsed.assignedAt : null;
        maintenanceCrewIds = maintenanceCrewIdsFromCompanyJson(parsed as Record<string, unknown>);
        maintenanceAwaitingRequesterSince = readMaintenanceAwaitingSince(parsed as Record<string, unknown>);
        maintenanceRequesterRejectReason = readMaintenanceRejectReason(parsed as Record<string, unknown>);
        const confRaw = (parsed as Record<string, unknown>)[MAINTENANCE_REQUESTER_CONFIRMED_AT_KEY];
        maintenanceRequesterConfirmedAt =
          typeof confRaw === 'string' && confRaw.trim() ? confRaw.trim() : null;
        checklistHistory = Array.isArray(parsed.checklistHistory)
          ? (parsed.checklistHistory as Array<{ at?: string; inspectionChecklist?: unknown[]; inspectionResult?: string; inspectionComments?: string }>).map((e) => ({
              at: e.at || '',
              inspectionChecklist: Array.isArray(e.inspectionChecklist) ? e.inspectionChecklist : [],
              inspectionResult: typeof e.inspectionResult === 'string' ? e.inspectionResult : undefined,
              inspectionComments: typeof e.inspectionComments === 'string' ? e.inspectionComments : undefined,
            }))
          : [];
        conflictReported = parsed.conflictReported === true;
        conflictStatus = typeof parsed.conflictStatus === 'string' ? parsed.conflictStatus : null;
        conflictResolution = typeof parsed.conflictResolution === 'string' ? parsed.conflictResolution : null;
        conflictReportComment = typeof parsed.conflictReportComment === 'string' ? parsed.conflictReportComment : null;
        conflictReportedAt = typeof parsed.conflictReportedAt === 'string' ? parsed.conflictReportedAt : null;
        conflictResolvedAt = typeof parsed.conflictResolvedAt === 'string' ? parsed.conflictResolvedAt : null;
        qfieldProjects = parseQFieldProjectsFromCompanyJson(parsed as Record<string, unknown>);
        withdrawalRequest = readWithdrawalRequest(row.company);
      }
      if (!workflowState && typeof parsed.workflowState === 'string') {
        workflowState = parsed.workflowState;
      }
      const resubmitMeta = readResubmitMeta(parsed as Record<string, unknown>);
      resubmitTarget = resubmitMeta.resubmitTarget;
      resubmissionHours = totalResubmissionHoursFromParsed(parsed as Record<string, unknown>);
      if (!resubmitReason && typeof parsed.resubmitReason === 'string') {
        resubmitReason = parsed.resubmitReason;
      }

      const cancellationMeta = readCancellationFromParsed(parsed as Record<string, unknown>);
      cancellationRequestStatus = cancellationMeta.cancellationRequestStatus;
      cancellationRequestedAt = cancellationMeta.cancellationRequestedAt;
      cancellationReason = cancellationMeta.cancellationReason;
      cancellationRejectedAt = cancellationMeta.cancellationRejectedAt;
      cancellationRejectionReason = cancellationMeta.cancellationRejectionReason;
      // Fallback: extract inspection result when COMPLETED (handles alternate company JSON structure)
      if (status === 'COMPLETED' && !inspectionResult && typeof parsed.inspectionResult === 'string') {
        inspectionResult = parsed.inspectionResult;
        if (!inspectionComments && typeof parsed.inspectionComments === 'string') inspectionComments = parsed.inspectionComments;
      }
    } catch {
      /* ignore */
    }
    if (String((row as { status?: string }).status ?? '').toUpperCase() === 'CANCELLED') {
      status = 'CANCELLED';
    }

    const statusTimeline = buildEnrichedStatusTimeline({
      logs,
      fallbackStatus: status as string,
      fallbackAt: row.createdAt,
      ncrResubmissions,
      resubmittedAt,
      resubmitReason,
      maintenanceRequesterConfirmedAt,
    });

    const maintenanceDescription = (row as any).maintenanceDescription ?? null;
    const beforeImageUrls = Array.isArray((row as any).beforeImageUrls) ? (row as any).beforeImageUrls : [];
    const finishingImageUrls = Array.isArray((row as any).finishingImageUrls) ? (row as any).finishingImageUrls : [];
    const assignedTeam = (row as any).assignedTeam
      ? {
          id: (row as any).assignedTeam.id,
          name: (row as any).assignedTeam.name,
          leader: (row as any).assignedTeam.leader
            ? { id: (row as any).assignedTeam.leader.id, fullName: (row as any).assignedTeam.leader.fullName, phone: (row as any).assignedTeam.leader.phone }
            : null,
        }
      : null;

    const req = (row as any).requester;
    const requesterName = req ? (req.name || req.username || null) : null;
    const ticketRequesterRole = req?.role ?? null;
    const requesterPhone = req?.phone ?? null;

    const maintenanceReason = (() => {
      try {
        const p = typeof row.company === 'string' ? JSON.parse(row.company) : {};
        return typeof p.maintenanceReason === 'string' ? p.maintenanceReason : null;
      } catch { return null; }
    })();

    let maintenanceCompletionReasonId: string | null = null;
    let maintenanceCompletionReasonLabel: string | null = null;
    let availableMaintenanceCompletionReasons: { id: string; label: string }[] = [];
    try {
      const p = typeof row.company === 'string' ? JSON.parse(row.company) : {};
      const sel = readMaintenanceCompletionReasonFromCompany(p as Record<string, unknown>);
      maintenanceCompletionReasonId = sel.id;
      maintenanceCompletionReasonLabel = sel.label;
      const reasonRows = await loadMaintenanceReasonsForTicket({
        id: row.id,
        technique: row.technique,
        privateCompanyId: (row as { privateCompanyId?: string | null }).privateCompanyId ?? null,
        privateCompanyTargetDepartmentId:
          (row as { privateCompanyTargetDepartmentId?: string | null })
            .privateCompanyTargetDepartmentId ?? null,
        company: row.company,
      });
      availableMaintenanceCompletionReasons = reasonRows.map((r: { id: string; label: string }) => ({
        id: r.id,
        label: r.label,
      }));
    } catch {
      /* optional tables / legacy */
    }

    const dbChecklistTemplateId =
      typeof (row as { checklistTemplateId?: string | null }).checklistTemplateId === 'string'
        ? (row as { checklistTemplateId: string }).checklistTemplateId
        : null;
    const effectiveTemplateId = dbChecklistTemplateId ?? embeddedChecklistTemplateId;
    const siteOwnerId = (row as { requesterId?: string | null }).requesterId ?? null;
    let embedCoordsFromJson: { siteLatitude: number; siteLongitude: number } | Record<string, never> = {};
    try {
      embedCoordsFromJson = embeddedTicketSiteCoords(JSON.parse(row.company as string));
    } catch {
      /* ignore */
    }
    const [siteCoords, checklistTpl] = await Promise.all([
      resolveTicketSiteCoordinates(prisma, siteName, siteOwnerId),
      resolveInspectionChecklistTemplate(prisma, effectiveTemplateId),
    ]);
    const mergedSiteCoords =
      Object.keys(embedCoordsFromJson).length > 0 ? embedCoordsFromJson : siteCoords;

    const assignmentScopeVal = (row as { assignmentScope?: string | null }).assignmentScope ?? null;
    const privateCompanyIdVal = (row as { privateCompanyId?: string | null }).privateCompanyId ?? null;
    let allowWorkspaceCrewJoin = false;
    if (
      assignmentScopeVal === 'PRIVATE_COMPANY_STAFF' &&
      privateCompanyIdVal &&
      String(status).toUpperCase() !== 'COMPLETED'
    ) {
      try {
        allowWorkspaceCrewJoin = await isWorkspaceCrewTicketTechnique(
          prisma,
          privateCompanyIdVal,
          row.technique
        );
      } catch {
        allowWorkspaceCrewJoin = false;
      }
    }

    let ticketExpenses: ReturnType<typeof expenseRowToJson>[] = [];
    let workspaceExpenseSettings: ReturnType<typeof serializeExpenseSettings> | null = null;
    try {
      const policy = await loadPlatformTicketPolicy();
      platformCancellationReasons = policy.cancellationReasons;
      platformResubmitReasons = policy.resubmitReasons;
    } catch {
      /* policy table may be absent before migrate */
    }

    let privateCompanyTargetDepartmentName: string | null = null;
    const targetDeptId =
      (row as { privateCompanyTargetDepartmentId?: string | null }).privateCompanyTargetDepartmentId ??
      null;
    if (targetDeptId && privateCompanyIdVal) {
      try {
        const deptRow = await prisma.privateCompanyDepartment.findFirst({
          where: { id: targetDeptId, companyId: privateCompanyIdVal },
          select: { name: true },
        });
        const dn = deptRow?.name?.trim();
        privateCompanyTargetDepartmentName = dn || null;
      } catch {
        /* departments table may be absent */
      }
    }

    if (privateCompanyIdVal) {
      try {
        const settingsRow = await loadExpenseSettings(privateCompanyIdVal);
        if (settingsRow) {
          const eff = await resolveEffectiveTicketExpensePolicy(prisma, privateCompanyIdVal, row.technique);
          const base = serializeExpenseSettings(settingsRow);
          workspaceExpenseSettings = { ...base, enabled: eff.enabled, reasons: eff.reasons };
          if (eff.enabled) {
            const expenseRows = await prisma.privateCompanyTicketExpense.findMany({
              where: { companyId: privateCompanyIdVal, ticketId: row.id },
              orderBy: { createdAt: 'asc' },
              include: {
                staff: { select: { id: true, name: true, username: true } },
              },
            });
            ticketExpenses = expenseRows.map(expenseRowToJson);
          }
        }
      } catch {
        /* expenses tables may be absent on legacy DB */
      }
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: row.id,
        siteName,
        siteCoordinator,
        slaHours,
        technique: row.technique,
        status,
        assignmentScope: (row as { assignmentScope?: string | null }).assignmentScope ?? null,
        privateCompanyId: (row as { privateCompanyId?: string | null }).privateCompanyId ?? null,
        privateCompanyTargetDepartmentId:
          (row as { privateCompanyTargetDepartmentId?: string | null }).privateCompanyTargetDepartmentId ??
          null,
        privateCompanyTargetDepartmentName,
        allowWorkspaceCrewJoin,
        createdAt: row.createdAt,
        completedAt,
        statusTimeline,
        maintenanceDescription,
        maintenanceReason,
        maintenanceCompletionReasonId,
        maintenanceCompletionReasonLabel,
        availableMaintenanceCompletionReasons,
        beforeImageUrls,
        finishingImageUrls,
        assignedTeam,
        designSpecifications,
        attachmentUrls,
        qfieldProjects,
        company: companyName,
        inspectionResult,
        inspectionComments,
        inspectionChecklist,
        ncrReason,
        ncrImageUrls,
        ncrResubmissions,
        assignedEngineerId,
        assignedEngineerName,
        assignedAt,
        maintenanceCrewIds,
        checklistHistory,
        requesterId: (row as { requesterId?: string | null }).requesterId ?? null,
        requesterName,
        requesterRole: ticketRequesterRole,
        requesterPhone,
        maintenanceAwaitingRequesterSince,
        maintenanceRequesterRejectReason,
        maintenanceRequesterConfirmedAt,
        conflictReported,
        conflictStatus,
        conflictResolution,
        conflictReportComment,
        conflictReportedAt,
        conflictResolvedAt,
        checklistTemplateId: checklistTpl.checklistTemplateId ?? effectiveTemplateId,
        checklistTemplate: checklistTpl.checklistTemplate,
        workspaceExpenseSettings,
        ticketExpenses,
        cancellationRequestStatus,
        cancellationRequestedAt,
        cancellationReason,
        cancellationRejectedAt,
        cancellationRejectionReason,
        withdrawalRequest,
        canRequestCancellation:
          String(status).toUpperCase() === 'PENDING' && cancellationRequestStatus !== 'PENDING',
        workflowState: workflowState ?? 'OPEN',
        resubmitReason,
        resubmittedAt,
        resubmitTarget,
        resubmissionHours,
        platformCancellationReasons,
        platformResubmitReasons,
        /** @deprecated use platformCancellationReasons */
        workspaceCancellationReasons: platformCancellationReasons,
        canEditForResubmit:
          workflowState === 'RESUBMITTED' && resubmitTarget === 'REQUESTER',
        ...mergedSiteCoords,
      },
    });
  } catch (err) {
    console.error('GET /api/tickets/[id]:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to load ticket' },
      { status: 500 }
    );
  }
}
