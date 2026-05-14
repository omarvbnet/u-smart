import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { createRequesterToken, getRequesterCookieOptions, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getVerifiedPhoneFromCookie } from '@/lib/otp-auth';
import { sendTicketNotificationEmail, sendTicketCompletedEmail, notifyTicketsTicket } from '@/lib/email';
import { notifyRequesterI18n } from '@/lib/localized-requester-notification';
import { getCoordinatorContext } from '@/lib/provider-company-auth';
import { getLinkedCoordinatorCompanyId, coordinatorRoleTicketWhere } from '@/lib/linked-coordinator-company';
import { hasPrivilege } from '@/lib/coordinator-access';
import { applySharedSiteTicketsToVisitorWhere } from '@/lib/site-share-access';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import {
  assignedStaffIdFromCompanyJson,
  parseTicketCompanyJson,
  ticketFieldStaffInvolvesRequester,
} from '@/lib/private-company-kpi';
import { fetchWorkspaceTechniqueRows, staffTicketTechniqueAllowed } from '@/lib/workspace-task-assignment';
import {
  MAINTENANCE_DISPATCH_ENGINEER,
  normalizeMaintenanceDispatchMode,
} from '@/lib/private-company-maintenance-dispatch';
import { sweepExpiredMaintenanceAwaitingConfirmations } from '@/lib/maintenance-requester-confirmation';
import {
  deriveSpecializationTagsFromTechnique,
  normalizeSpecializationTags,
} from '@/lib/technique-specialization-tags';
import { lookupProvisorTechniqueCategory } from '@/lib/provisor-technique-lookup';
import { filterRowsToMaintenanceTickets } from '@/lib/technician-maintenance-rows';

// Cast so TS sees generated delegates (ticketRequester, visitorRequest, notification) after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ENTERPRISE_TECHNIQUES = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'];
const QUALITY_CONTROL_TECHNIQUES = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'];
// Maintenance ticket types (technician only): stored as technique
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const ALL_TECHNIQUES = [...ENTERPRISE_TECHNIQUES, ...QUALITY_CONTROL_TECHNIQUES, ...MAINTENANCE_TECHNIQUES];
const TASK_CATEGORY_VALUES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'];

/** QC ticket pool (mobile / dashboard): not only legacy `ENGINEER` role. */
function isQcPoolEngineerRole(role: string | null | undefined) {
  const r = (role ?? '').toUpperCase();
  return r === 'ENGINEER' || r === 'QUALITY_ENGINEER' || r === 'SUPERVISION_ENGINEER';
}
const PLAN_RATE_USD: Record<string, number> = {
  WEEKLY: 0.7,
  MONTHLY: 0.6,
  YEARLY: 0.5,
};
const ROLE_SCOPE_BY_TASK_CATEGORY: Record<string, string> = {
  QUALITY: 'QUALITY_ENGINEER',
  SUPERVISION: 'SUPERVISION_ENGINEER',
  MAINTENANCE: 'TECHNICIAN',
};
const TASK_CREATOR_ROLES = new Set(['COMPANY_OWNER', 'COORDINATOR', 'ADMIN', 'MANAGER', 'TEAM_LEADER']);
const REQUESTER_TASK_CATEGORY_BY_TECHNIQUE = (technique: string): 'QUALITY' | 'SUPERVISION' | 'MAINTENANCE' => {
  if (MAINTENANCE_TECHNIQUES.includes(technique)) return 'MAINTENANCE';
  if (technique === 'supervision') return 'SUPERVISION';
  return 'QUALITY';
};

async function getRequesterChecklistCompanyId(
  requester: { id: string; username?: string | null; email?: string | null; role?: string | null }
): Promise<string | null> {
  const role = String(requester.role ?? '').toUpperCase();
  if (role === 'COMPANY') {
    try {
      const linked = await getLinkedCoordinatorCompanyId(prisma, {
        id: requester.id,
        username: requester.username ?? '',
        email: requester.email ?? null,
        role,
      });
      if (linked) return linked;
    } catch {
      /* ignore */
    }
  }
  try {
    const username = (requester.username ?? '').trim();
    const email = typeof requester.email === 'string' ? requester.email.trim().toLowerCase() : '';
    if (!username && !email) return null;
    const owner = await (prisma as any).coordinatorUser.findFirst({
      where: {
        OR: [
          ...(username ? [{ username: { equals: username, mode: 'insensitive' } }] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' } }] : []),
        ],
      },
      select: { companyId: true },
    });
    return owner?.companyId ?? null;
  } catch (e) {
    console.error('getRequesterChecklistCompanyId:', e);
    return null;
  }
}

async function notifyRoleNewTicket(
  ticketId: string,
  province: string,
  siteName: string,
  role: 'ENGINEER' | 'TECHNICIAN',
  _roleLabel: string,
  opts?: { directoryOnly?: boolean }
) {
  try {
    const where: Record<string, unknown> = {
      role,
      status: 'ACTIVE',
      serviceSlug: 'quality-control-supervision',
    };
    if (opts?.directoryOnly) {
      // Private workspace chose "all system staff": only notify platform accounts
      // that are vetted (APPROVED) and not tied to another workspace as staff.
      where.privateCompanyId = null;
      where.verificationStatus = 'APPROVED';
    }
    const recipients = await prisma.ticketRequester.findMany({
      where,
      select: { id: true, province: true, provinceFilterActive: true },
    });
    const roleKind = role === 'TECHNICIAN' ? 'maintenance' : 'qc';
    for (const recipient of recipients) {
      const filterActive = recipient.provinceFilterActive ?? true;
      const recipientProvince = recipient.province ?? null;
      const provNorm = (province ?? '').trim().toLowerCase();
      const recNorm = (recipientProvince ?? '').trim().toLowerCase();
      if (filterActive && recipientProvince && provNorm && recNorm !== provNorm) continue;
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'new_ticket',
          ticketId,
          requesterId: recipient.id,
          payload: {
            key: 'new_ticket_role',
            vars: { roleKind, province, siteName },
          },
          data: { ticketId, type: 'new_ticket' },
        });
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    console.error('notifyRoleNewTicket:', e);
  }
}

async function notifyEngineersNewTicket(
  ticketId: string,
  province: string,
  siteName: string,
  opts?: { directoryOnly?: boolean }
) {
  await notifyRoleNewTicket(ticketId, province, siteName, 'ENGINEER', 'QC', opts);
}

async function notifyTechniciansNewTicket(
  ticketId: string,
  province: string,
  siteName: string,
  opts?: { directoryOnly?: boolean }
) {
  await notifyRoleNewTicket(ticketId, province, siteName, 'TECHNICIAN', 'maintenance', opts);
}

/**
 * Notify only members of a private-company workspace whose role is allowed
 * to act on the ticket (engineers/technicians/managers/coordinators) plus the
 * workspace owner. Used when a ticket is scoped to PRIVATE_COMPANY_STAFF.
 */
async function notifyPrivateCompanyMembersNewTicket(
  ticketId: string,
  privateCompanyId: string,
  technique: string,
  province: string,
  siteName: string,
  opts?: { maintenanceStyle?: boolean; targetDepartmentId?: string | null }
) {
  try {
    const company = await (prisma as any).privateCompany.findUnique({
      where: { id: privateCompanyId },
      select: {
        ownerRequesterId: true,
        staff: {
          select: {
            id: true,
            role: true,
            status: true,
            province: true,
            provinceFilterActive: true,
            privateCompanyDepartmentId: true,
            privateCompanyAllowedTaskSlugs: true,
          },
        },
      },
    });
    if (!company) return;
    const isMaintenance =
      opts?.maintenanceStyle === true || MAINTENANCE_TECHNIQUES.includes(technique);
    const targetDept = opts?.targetDepartmentId?.trim() || null;
    let maintenanceViaEngineer = false;
    if (isMaintenance && targetDept) {
      try {
        const drow = await prisma.privateCompanyDepartment.findFirst({
          where: { id: targetDept, companyId: privateCompanyId },
          select: { maintenanceDispatchMode: true },
        });
        maintenanceViaEngineer =
          normalizeMaintenanceDispatchMode(drow?.maintenanceDispatchMode) === MAINTENANCE_DISPATCH_ENGINEER;
      } catch {
        maintenanceViaEngineer = false;
      }
    }
    const allowed = new Set<string>(['MANAGER', 'COORDINATOR']);
    if (isMaintenance) {
      if (maintenanceViaEngineer) {
        allowed.add('ENGINEER');
        allowed.add('QUALITY_ENGINEER');
        allowed.add('SUPERVISION_ENGINEER');
      } else {
        allowed.add('TECHNICIAN');
      }
    } else {
      allowed.add('ENGINEER');
    }
    const techRows = await fetchWorkspaceTechniqueRows(prisma, privateCompanyId);
    const recipientIds = new Set<string>([company.ownerRequesterId]);
    for (const s of (company.staff ?? []) as Array<{
      id: string;
      role: string | null;
      status: string | null;
      province: string | null;
      provinceFilterActive: boolean | null;
      privateCompanyDepartmentId: string | null;
      privateCompanyAllowedTaskSlugs: string[] | null;
    }>) {
      if ((s.status ?? 'ACTIVE') !== 'ACTIVE') continue;
      if (targetDept) {
        const sid = s.privateCompanyDepartmentId ?? null;
        if (!sid || sid !== targetDept) continue;
      }
      const role = String(s.role ?? '').toUpperCase();
      if (!allowed.has(role)) continue;
      const filterActive = s.provinceFilterActive ?? true;
      const provNorm = (province ?? '').trim().toLowerCase();
      const staffProv = (s.province ?? '').trim().toLowerCase();
      if (filterActive && s.province && staffProv && staffProv !== provNorm) continue;
      if (
        !staffTicketTechniqueAllowed({
          technique,
          staffDepartmentId: s.privateCompanyDepartmentId ?? null,
          staffAllowedSlugs: Array.isArray(s.privateCompanyAllowedTaskSlugs) ? s.privateCompanyAllowedTaskSlugs : [],
          workspaceRows: techRows,
        })
      ) {
        continue;
      }
      recipientIds.add(s.id);
    }
    const roleKind = isMaintenance ? 'maintenance' : 'qc';
    for (const recipientId of recipientIds) {
      try {
        await notifyRequesterI18n({
          prisma,
          type: 'new_ticket',
          ticketId,
          requesterId: recipientId,
          payload: {
            key: 'new_ticket_role',
            vars: { roleKind, province, siteName },
          },
          data: { ticketId, type: 'new_ticket', scope: 'private_company' },
        });
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    console.error('notifyPrivateCompanyMembersNewTicket:', e);
  }
}

function generateUsername(): string {
  const prefix = 'req';
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${random}`;
}

function generatePassword(): string {
  return crypto.randomBytes(8).toString('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const siteName = typeof body.siteName === 'string' ? body.siteName.trim() : '';
    const siteCoordinator = typeof body.siteCoordinator === 'string' ? body.siteCoordinator.trim() : '';
    let slaHours = typeof body.slaHours === 'number' ? body.slaHours : (typeof body.slaHours === 'string' ? parseInt(body.slaHours, 10) : 24);
    if (Number.isNaN(slaHours) || slaHours < 0) slaHours = 24;
    const technique = typeof body.technique === 'string' ? body.technique.trim().toLowerCase() : '';
    let name = typeof body.name === 'string' ? body.name.trim() : '';
    let company = typeof body.company === 'string' ? body.company.trim() : '';
    let phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    let province = typeof body.province === 'string' ? body.province.trim() : '';

    const requestedAssignmentScopeRaw =
      typeof body.assignmentScope === 'string' ? body.assignmentScope.trim().toUpperCase() : '';
    const wantsOpenPoolAssignmentScope =
      requestedAssignmentScopeRaw === 'GLOBAL' ||
      requestedAssignmentScopeRaw === 'USMART_STAFF' ||
      requestedAssignmentScopeRaw === 'ALL' ||
      requestedAssignmentScopeRaw === 'OPEN';
    const wantsPrivateCompanyAssignmentScope =
      requestedAssignmentScopeRaw === 'PRIVATE_COMPANY' ||
      requestedAssignmentScopeRaw === 'PRIVATE_COMPANY_STAFF';

    if (!siteName || !siteCoordinator || !technique) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_TICKET_FIELDS',
          message: 'Site name, site location, and technique are required',
        },
        { status: 400 }
      );
    }

    const auth = getRequesterFromRequest(req);
    const payload = auth?.payload ?? null;
    const coordinatorContext = payload ? await getCoordinatorContext(req) : null;
    let requester: { email?: string | null; id?: string; username?: string | null; role?: string | null } | null = null;
    let requesterRole: string | null = null;

    if (payload && !coordinatorContext) {
      const reqData = await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: { id: true, phone: true, name: true, company: true, serviceSlug: true, status: true, email: true, role: true, username: true },
      });
      requester = reqData;
      if (!reqData) {
        return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
      }
      requesterRole = (reqData as { role?: string | null }).role ?? null;
      const status = (reqData as { status?: string }).status;
      if (status === 'BLOCKED' || status === 'SUSPENDED') {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }
      if (!phone) phone = reqData.phone;
      if (!province) province = 'N/A';
      if (!name && reqData.name) name = reqData.name ?? '';
      if (!company && reqData.company) company = reqData.company ?? '';
    } else if (!payload) {
      if (!phone || !province) {
        return NextResponse.json(
          { success: false, message: 'Phone and province are required when not logged in' },
          { status: 400 }
        );
      }
      const verifiedPhone = await getVerifiedPhoneFromCookie();
      if (!verifiedPhone || phone !== verifiedPhone) {
        return NextResponse.json(
          { success: false, message: 'Phone number must be verified with OTP first' },
          { status: 400 }
        );
      }
    }

    if (coordinatorContext) {
      if (coordinatorContext.status !== 'ACTIVE') {
        return NextResponse.json(
          { success: false, message: 'Your account is blocked or suspended. Please contact support.' },
          { status: 403 }
        );
      }
      phone = phone || 'N/A';
      province = province || 'N/A';
      name = name || coordinatorContext.name || coordinatorContext.username;
      company = company || coordinatorContext.companyId;
    }

    let approvedWorkspaceCompanyId: string | null = null;
    if (payload?.requesterId) {
      const m = await getPrivateCompanyMembership(payload.requesterId);
      if (m.effectiveCompanyId) {
        const comp = await prisma.privateCompany.findUnique({
          where: { id: m.effectiveCompanyId },
          select: { status: true },
        });
        if (comp?.status === 'APPROVED') {
          approvedWorkspaceCompanyId = m.effectiveCompanyId;
        }
      }
    }

    let provisorTechniqueKind: 'INSPECTION_QC' | 'MAINTENANCE' | null = null;
    if (!ALL_TECHNIQUES.includes(technique)) {
      provisorTechniqueKind = await lookupProvisorTechniqueCategory(prisma, technique, {
        workspaceCompanyId: approvedWorkspaceCompanyId,
      });
    }
    if (!ALL_TECHNIQUES.includes(technique) && !provisorTechniqueKind) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_TECHNIQUE',
          message: 'Invalid technique',
        },
        { status: 400 }
      );
    }

    const ticketIsMaintenanceKind =
      MAINTENANCE_TECHNIQUES.includes(technique) || provisorTechniqueKind === 'MAINTENANCE';
    const ticketUsesQcServiceSlug =
      QUALITY_CONTROL_TECHNIQUES.includes(technique) ||
      MAINTENANCE_TECHNIQUES.includes(technique) ||
      provisorTechniqueKind === 'INSPECTION_QC' ||
      provisorTechniqueKind === 'MAINTENANCE';

    // Worker cannot create any tickets – view-only, admin-assigned
    if (payload && !coordinatorContext) {
      if (requesterRole === 'WORKER') {
        return NextResponse.json(
          { success: false, message: 'Workers cannot create tickets. You can only view tickets assigned to you.' },
          { status: 403 }
        );
      }
    }

    const isMaintenanceTicket = ticketIsMaintenanceKind;
    if (isMaintenanceTicket && payload && !coordinatorContext) {
      // Private-company workspace members (manager/coordinator/engineer) are
      // also allowed to file maintenance tickets on behalf of their workspace.
      let inPrivateWorkspace = false;
      try {
        const me = await prisma.ticketRequester.findUnique({
          where: { id: payload.requesterId },
          select: {
            privateCompanyId: true,
            privateCompanyOwned: { select: { id: true, status: true } },
          },
        });
        const meAny = me as {
          privateCompanyId?: string | null;
          privateCompanyOwned?: { id: string; status: string } | null;
        } | null;
        inPrivateWorkspace =
          (meAny?.privateCompanyOwned?.status === 'APPROVED') ||
          !!meAny?.privateCompanyId;
      } catch {
        inPrivateWorkspace = false;
      }
      const allowedRoles = ['COMPANY', 'PERSONAL'];
      const allowedPrivateStaff = ['MANAGER', 'COORDINATOR', 'ENGINEER', 'TECHNICIAN'];
      const allowed =
        (requesterRole && allowedRoles.includes(requesterRole)) ||
        (inPrivateWorkspace &&
          requesterRole != null &&
          allowedPrivateStaff.includes(requesterRole));
      if (!allowed) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Only company / personal accounts (or approved workspace managers, coordinators, engineers, and technicians) can create maintenance tickets.',
          },
          { status: 403 }
        );
      }
    }

    if (payload && !coordinatorContext && requesterRole === 'PERSONAL') {
      const siteDelegate = (prisma as any).site;
      if (!siteDelegate?.findFirst) {
        return NextResponse.json(
          { success: false, message: 'Sites are not available right now. Please try again later.' },
          { status: 503 }
        );
      }
      const personalSite = await siteDelegate.findFirst({
        where: {
          requesterId: payload.requesterId,
          siteId: siteName,
        },
        select: { siteId: true, province: true },
      });
      if (!personalSite) {
        return NextResponse.json(
          { success: false, message: 'Personal accounts can create tickets only for sites added in your dashboard.' },
          { status: 403 }
        );
      }
      if (!province || province === 'N/A') {
        province = personalSite.province || province;
      }
    }

    if (slaHours < 0 || slaHours > 8760) {
      return NextResponse.json(
        { success: false, message: 'SLA hours must be between 0 and 8760' },
        { status: 400 }
      );
    }

    let coordinatorTaskCategory: string | null = null;
    let coordinatorRoleScope: string | null = null;
    let checklistTemplateId: string | null = null;
    let assigneeCoordinatorUserId: string | null = null;
    let assignmentScope: string | null = null;
    let privateCompanyIdForTicket: string | null = null;
    /** When set, the creator belongs to an approved private workspace (owner or staff). */
    let creatorPrivateWorkspaceId: string | null = null;
    let resubmitToRequester = false;
    let autoTaskCategory: 'QUALITY' | 'SUPERVISION' | 'MAINTENANCE' | null = null;
    let autoRoleScope: 'QUALITY_ENGINEER' | 'SUPERVISION_ENGINEER' | 'TECHNICIAN' | null = null;
    let autoChecklistTemplateId: string | null = null;

    if (coordinatorContext) {
      const canCreateTasks =
        TASK_CREATOR_ROLES.has(coordinatorContext.role) ||
        hasPrivilege(coordinatorContext.privileges, 'CREATE_TASKS');
      if (!canCreateTasks) {
        return NextResponse.json(
          { success: false, message: 'Your role is not allowed to create tasks.' },
          { status: 403 }
        );
      }

      const taskCategoryRaw = typeof body.taskCategory === 'string' ? body.taskCategory.trim().toUpperCase() : '';
      if (!TASK_CATEGORY_VALUES.includes(taskCategoryRaw)) {
        return NextResponse.json(
          { success: false, message: 'taskCategory is required and must be MAINTENANCE, QUALITY, or SUPERVISION.' },
          { status: 400 }
        );
      }
      coordinatorTaskCategory = taskCategoryRaw;
      coordinatorRoleScope = ROLE_SCOPE_BY_TASK_CATEGORY[taskCategoryRaw] ?? 'ANY';
      checklistTemplateId = typeof body.checklistTemplateId === 'string' ? body.checklistTemplateId.trim() : '';
      if (!checklistTemplateId) {
        return NextResponse.json(
          { success: false, message: 'A checklist template is required for coordinator-created tasks.' },
          { status: 400 }
        );
      }
      const checklist = await (prisma as any).inspectionChecklist.findFirst({
        where: {
          id: checklistTemplateId,
          OR: [{ companyId: coordinatorContext.companyId }, { companyId: null }],
        },
        select: { id: true, taskCategory: true, techniqueTypes: true },
      });
      if (!checklist) {
        return NextResponse.json(
          { success: false, message: 'Checklist not found for your company.' },
          { status: 404 }
        );
      }
      if (checklist.taskCategory && checklist.taskCategory !== taskCategoryRaw) {
        return NextResponse.json(
          { success: false, message: 'Checklist task category is not compatible with this task.' },
          { status: 400 }
        );
      }
      if (Array.isArray(checklist.techniqueTypes) && checklist.techniqueTypes.length > 0 && !checklist.techniqueTypes.includes(technique)) {
        return NextResponse.json(
          { success: false, message: 'Checklist is not compatible with this technique type.' },
          { status: 400 }
        );
      }

      const assigneeIdRaw = typeof body.assigneeCoordinatorUserId === 'string' ? body.assigneeCoordinatorUserId.trim() : '';
      if (assigneeIdRaw) {
        const assignee = await (prisma as any).coordinatorUser.findFirst({
          where: { id: assigneeIdRaw, companyId: coordinatorContext.companyId, status: 'ACTIVE' },
          select: { id: true, role: true },
        });
        if (!assignee) {
          return NextResponse.json({ success: false, message: 'Assigned user not found in your company.' }, { status: 404 });
        }
        const requiredRole = ROLE_SCOPE_BY_TASK_CATEGORY[taskCategoryRaw];
        const assigneeRole = String(assignee.role ?? '').toUpperCase();
        const roleMatch =
          !requiredRole ||
          assigneeRole === requiredRole ||
          assigneeRole === 'ENGINEER' ||
          assigneeRole === 'TEAM_LEADER' ||
          assigneeRole === 'MANAGER' ||
          assigneeRole === 'COORDINATOR';
        if (!roleMatch) {
          return NextResponse.json(
            { success: false, message: `Assigned user must have role ${requiredRole} for this task type.` },
            { status: 400 }
          );
        }
        assigneeCoordinatorUserId = assignee.id;
      }

      assignmentScope = typeof body.assignmentScope === 'string'
        ? body.assignmentScope.trim().toUpperCase()
        : 'COMPANY_STAFF';
      if (assignmentScope !== 'COMPANY_STAFF' && assignmentScope !== 'USMART_STAFF') {
        assignmentScope = 'COMPANY_STAFF';
      }
      resubmitToRequester = body.resubmitToRequester === true;

      const companyRow = await (prisma as any).coordinatorCompany.findUnique({
        where: { id: coordinatorContext.companyId },
        select: {
          id: true,
          freeTicketsUsed: true,
          freeTicketsLimit: true,
          activeTicketPlan: true,
        },
      });
      if (!companyRow) {
        return NextResponse.json({ success: false, message: 'Company not found.' }, { status: 404 });
      }
      const freeLimit = companyRow.freeTicketsLimit ?? 50;
      const freeUsed = companyRow.freeTicketsUsed ?? 0;
      if (freeUsed >= freeLimit && !companyRow.activeTicketPlan) {
        return NextResponse.json(
          { success: false, message: 'Free quota reached (50 tickets). Activate a billing plan to create new tickets.' },
          { status: 402 }
        );
      }
    } else {
      autoTaskCategory =
        provisorTechniqueKind === 'MAINTENANCE'
          ? 'MAINTENANCE'
          : REQUESTER_TASK_CATEGORY_BY_TECHNIQUE(technique);
      autoRoleScope = ROLE_SCOPE_BY_TASK_CATEGORY[autoTaskCategory] as
        | 'QUALITY_ENGINEER'
        | 'SUPERVISION_ENGINEER'
        | 'TECHNICIAN';

      // Private-company scope: when the requester is in an APPROVED workspace
      // they can choose to keep the ticket inside their own staff or open it to
      // every system engineer/technician (default).
      if (payload && requester?.id) {
        try {
          const me = await prisma.ticketRequester.findUnique({
            where: { id: requester.id },
            select: {
              privateCompanyId: true,
              privateCompanyOwned: { select: { id: true, status: true } },
            },
          });
          const myWorkspaceId =
            (me as { privateCompanyOwned?: { id: string; status: string } | null })
              ?.privateCompanyOwned?.status === 'APPROVED'
              ? (me as { privateCompanyOwned?: { id: string } | null })?.privateCompanyOwned?.id ?? null
              : (me as { privateCompanyId?: string | null })?.privateCompanyId ?? null;
          creatorPrivateWorkspaceId = myWorkspaceId;
          if (
            myWorkspaceId &&
            !wantsOpenPoolAssignmentScope &&
            (wantsPrivateCompanyAssignmentScope || requestedAssignmentScopeRaw === '')
          ) {
            assignmentScope = 'PRIVATE_COMPANY_STAFF';
            privateCompanyIdForTicket = myWorkspaceId;
          }
        } catch (_) {
          /* private-company tables may be absent on legacy databases */
        }
      }

      // Optional client-provided checklist (private-company workspace or shared admin templates).
      const explicitChecklistId = typeof body.checklistTemplateId === 'string' ? body.checklistTemplateId.trim() : '';
      if (explicitChecklistId) {
        let resolved: { id: string; source: 'private' | 'admin' } | null = null;
        try {
          const pc = await (prisma as any).privateCompanyChecklist?.findUnique?.({
            where: { id: explicitChecklistId },
            select: { id: true, companyId: true, techniqueTypes: true, category: true },
          });
          if (pc && payload && requester?.id) {
            const me = await prisma.ticketRequester.findUnique({
              where: { id: requester.id },
              select: {
                privateCompanyId: true,
                privateCompanyOwned: { select: { id: true, status: true } },
              },
            });
            const myWorkspaceId =
              me?.privateCompanyOwned?.status === 'APPROVED'
                ? me.privateCompanyOwned.id
                : (me?.privateCompanyId ?? null);
            if (
              myWorkspaceId &&
              myWorkspaceId === pc.companyId &&
              !wantsOpenPoolAssignmentScope
            ) {
              resolved = { id: pc.id, source: 'private' };
            }
          }
        } catch (_) {
          /* table may be absent on legacy databases */
        }
        if (!resolved) {
          const ic = await (prisma as any).inspectionChecklist.findFirst({
            where: { id: explicitChecklistId },
            select: { id: true, companyId: true, techniqueTypes: true, taskCategory: true },
          });
          if (ic) resolved = { id: ic.id, source: 'admin' };
        }
        if (resolved) autoChecklistTemplateId = resolved.id;
      }

      if (!autoChecklistTemplateId) {
        let requesterCompanyScopeId: string | null = null;
        if (payload && requester?.id) {
          requesterCompanyScopeId = await getRequesterChecklistCompanyId({
            id: requester.id,
            username: requester.username ?? null,
            email: requester.email ?? null,
            role: requester.role ?? requesterRole,
          });
        }
        const checklistCandidates = await (prisma as any).inspectionChecklist.findMany({
          where: {
            taskCategory: autoTaskCategory,
            OR: [
              ...(requesterCompanyScopeId ? [{ companyId: requesterCompanyScopeId }] : []),
              { companyId: null },
            ],
          },
          select: { id: true, companyId: true, techniqueTypes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        const techniqueMatched = checklistCandidates.filter((c: { techniqueTypes?: string[] | null }) => {
          const types = Array.isArray(c.techniqueTypes) ? c.techniqueTypes : [];
          return types.length === 0 || types.includes(technique);
        });
        const best = techniqueMatched.sort((a: { companyId?: string | null }, b: { companyId?: string | null }) => {
          const aCompany = a.companyId ? 1 : 0;
          const bCompany = b.companyId ? 1 : 0;
          return bCompany - aCompany;
        })[0];
        autoChecklistTemplateId = best?.id ?? null;
      }
    }

    const designSpecifications = typeof body.designSpecifications === 'string' ? body.designSpecifications.trim() : '';
    const attachmentUrls = Array.isArray(body.attachmentUrls) ? body.attachmentUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];
    const maintenanceReason = typeof body.maintenanceReason === 'string' ? body.maintenanceReason.trim() : '';
    const beforeImageUrls = Array.isArray(body.beforeImageUrls) ? body.beforeImageUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];

    let embedSiteLat: number | undefined;
    let embedSiteLng: number | undefined;
    const rawLat = body.siteLatitude;
    const rawLng = body.siteLongitude;
    if (typeof rawLat === 'number' && typeof rawLng === 'number' && Number.isFinite(rawLat) && Number.isFinite(rawLng)) {
      embedSiteLat = rawLat;
      embedSiteLng = rawLng;
    } else if (typeof rawLat === 'string' && typeof rawLng === 'string') {
      const la = parseFloat(rawLat.trim());
      const lo = parseFloat(rawLng.trim());
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        embedSiteLat = la;
        embedSiteLng = lo;
      }
    }

    const explicitSpecTags = normalizeSpecializationTags(body.specializationTags);
    const specializationTags =
      explicitSpecTags.length > 0 ? explicitSpecTags : deriveSpecializationTagsFromTechnique(technique);

    let privateCompanyTargetDepartmentId: string | null = null;
    if (
      !coordinatorContext &&
      assignmentScope === 'PRIVATE_COMPANY_STAFF' &&
      privateCompanyIdForTicket &&
      payload?.requesterId
    ) {
      const creator = await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: {
          role: true,
          privateCompanyDepartmentId: true,
          privateCompanyOwned: { select: { id: true, status: true } },
        },
      });
      const roleUpper = String(creator?.role ?? '').toUpperCase();
      const isWorkspaceOwner =
        creator?.privateCompanyOwned?.status === 'APPROVED' &&
        creator.privateCompanyOwned.id === privateCompanyIdForTicket;
      const canPickTargetDept =
        roleUpper === 'COORDINATOR' || (roleUpper === 'COMPANY' && isWorkspaceOwner);

      if (canPickTargetDept) {
        const raw =
          typeof body.privateCompanyTargetDepartmentId === 'string'
            ? body.privateCompanyTargetDepartmentId.trim()
            : '';
        if (raw) {
          const deptRow = await prisma.privateCompanyDepartment.findFirst({
            where: { id: raw, companyId: privateCompanyIdForTicket },
            select: { id: true },
          });
          if (!deptRow) {
            return NextResponse.json(
              { success: false, message: 'Target department is not part of this workspace.' },
              { status: 400 }
            );
          }
          privateCompanyTargetDepartmentId = deptRow.id;
        }
      } else {
        privateCompanyTargetDepartmentId = creator?.privateCompanyDepartmentId ?? null;
        if (!privateCompanyTargetDepartmentId) {
          return NextResponse.json(
            {
              success: false,
              message:
                'Workspace staff tickets require your profile department. Ask the workspace owner to assign you to a department.',
            },
            { status: 400 }
          );
        }
      }
    }

    const companyPayloadObj: Record<string, unknown> = {
      _ticket: 1,
      siteName,
      siteCoordinator,
      slaHours: slaHours > 0 ? slaHours : null,
      company: company || null,
      designSpecifications: designSpecifications || null,
      attachmentUrls: attachmentUrls.length > 0 ? attachmentUrls : null,
    };
    if (embedSiteLat !== undefined && embedSiteLng !== undefined) {
      companyPayloadObj.siteLatitude = embedSiteLat;
      companyPayloadObj.siteLongitude = embedSiteLng;
    }
    if (coordinatorContext) {
      companyPayloadObj.taskCategory = coordinatorTaskCategory;
      companyPayloadObj.roleScope = coordinatorRoleScope;
      companyPayloadObj.assignmentScope = assignmentScope;
      companyPayloadObj.checklistTemplateId = checklistTemplateId;
      companyPayloadObj.workflowState = 'OPEN';
      if (assigneeCoordinatorUserId) {
        companyPayloadObj.assigneeCoordinatorUserId = assigneeCoordinatorUserId;
      }
      if (resubmitToRequester) {
        companyPayloadObj.resubmitToRequester = true;
      }
    } else if (autoTaskCategory) {
      companyPayloadObj.taskCategory = autoTaskCategory;
      companyPayloadObj.roleScope = autoRoleScope;
      if (autoChecklistTemplateId) {
        companyPayloadObj.checklistTemplateId = autoChecklistTemplateId;
      }
      if (assignmentScope === 'PRIVATE_COMPANY_STAFF' && privateCompanyIdForTicket) {
        companyPayloadObj.assignmentScope = assignmentScope;
        companyPayloadObj.privateCompanyId = privateCompanyIdForTicket;
      }
    }
    if (isMaintenanceTicket && maintenanceReason) {
      companyPayloadObj.maintenanceReason = maintenanceReason;
    }
    const companyPayload = JSON.stringify(companyPayloadObj);

    const serviceSlug = ticketUsesQcServiceSlug
      ? 'quality-control-supervision'
      : 'enterprise-networking';

    const ticketData: {
      buildingType: string;
      phone: string;
      province: string;
      technique: string;
      name: string | null;
      company: string;
      serviceSlug: string;
      siteName?: string;
      requesterId?: string;
      beforeImageUrls?: string[];
      taskCategory?: string;
      roleScope?: string;
      workflowState?: string;
      assignmentScope?: string;
      checklistTemplateId?: string;
      privateCompanyId?: string;
      privateCompanyTargetDepartmentId?: string | null;
      coordinatorCompanyId?: string;
      createdByCoordinatorUserId?: string;
      assigneeCoordinatorUserId?: string;
      specializationTags?: string[];
    } = {
      buildingType: 'n/a',
      phone,
      province,
      technique,
      name: name || null,
      company: companyPayload,
      serviceSlug,
      siteName, // so GET /api/sites can count tickets by site
      specializationTags,
    };

    if (payload) {
      if (coordinatorContext) {
        ticketData.coordinatorCompanyId = coordinatorContext.companyId;
        ticketData.createdByCoordinatorUserId = coordinatorContext.userId;
      } else {
        ticketData.requesterId = payload.requesterId;
      }
    }
    // Maintenance "before/after site evidence" is captured in the field workflow
    // (IN_PROGRESS). Requesters may only attach optional specs via attachmentUrls / designSpecifications.
    if (
      isMaintenanceTicket &&
      beforeImageUrls.length > 0 &&
      coordinatorContext
    ) {
      ticketData.beforeImageUrls = beforeImageUrls;
    }
    if (coordinatorContext) {
      if (coordinatorTaskCategory) ticketData.taskCategory = coordinatorTaskCategory;
      if (coordinatorRoleScope) ticketData.roleScope = coordinatorRoleScope;
      ticketData.workflowState = 'OPEN';
      if (assignmentScope) ticketData.assignmentScope = assignmentScope;
      if (checklistTemplateId) ticketData.checklistTemplateId = checklistTemplateId;
      if (assigneeCoordinatorUserId) ticketData.assigneeCoordinatorUserId = assigneeCoordinatorUserId;
    } else {
      if (autoTaskCategory) ticketData.taskCategory = autoTaskCategory;
      if (autoRoleScope) ticketData.roleScope = autoRoleScope;
      if (autoChecklistTemplateId) ticketData.checklistTemplateId = autoChecklistTemplateId;
      if (assignmentScope === 'PRIVATE_COMPANY_STAFF' && privateCompanyIdForTicket) {
        ticketData.assignmentScope = assignmentScope;
        ticketData.privateCompanyId = privateCompanyIdForTicket;
        if (privateCompanyTargetDepartmentId) {
          ticketData.privateCompanyTargetDepartmentId = privateCompanyTargetDepartmentId;
        }
      }
    }

    let ticket;
    try {
      ticket = await prisma.visitorRequest.create({ data: ticketData });
    } catch (createErr) {
      const err = createErr as Error & { code?: string; meta?: unknown };
      const isMissingColumn =
        err?.code === 'P2022' ||
        /column .* does not exist/i.test(err?.message ?? '');
      // P2022 = column missing in DB. Some private-company columns may not
      // have been migrated yet on legacy environments — retry once without
      // them so basic ticket creation still succeeds.
      const droppedKeys: string[] = [];
      if (isMissingColumn) {
        const fallbackData: Record<string, unknown> = { ...ticketData };
        for (const key of [
          'privateCompanyId',
          'privateCompanyTargetDepartmentId',
          'assignmentScope',
          'workflowState',
          'roleScope',
          'taskCategory',
          'checklistTemplateId',
          'assigneeCoordinatorUserId',
          'coordinatorCompanyId',
          'createdByCoordinatorUserId',
          'specializationTags',
        ]) {
          if (key in fallbackData) {
            droppedKeys.push(key);
            delete fallbackData[key];
          }
        }
        try {
          ticket = await prisma.visitorRequest.create({ data: fallbackData as typeof ticketData });
          console.warn(
            `POST /api/tickets: created ticket without optional columns due to schema drift. Dropped: ${droppedKeys.join(', ')}. Run prisma migrate deploy.`
          );
        } catch (retryErr) {
          throw retryErr;
        }
      } else {
        throw createErr;
      }
    }

    if (coordinatorContext) {
      const companyRow = await (prisma as any).coordinatorCompany.findUnique({
        where: { id: coordinatorContext.companyId },
        select: {
          id: true,
          freeTicketsUsed: true,
          freeTicketsLimit: true,
          activeTicketPlan: true,
        },
      });
      if (companyRow) {
        const freeUsed = companyRow.freeTicketsUsed ?? 0;
        const freeLimit = companyRow.freeTicketsLimit ?? 50;
        if (freeUsed < freeLimit) {
          await (prisma as any).coordinatorCompany.update({
            where: { id: companyRow.id },
            data: { freeTicketsUsed: freeUsed + 1 },
          });
        } else if (companyRow.activeTicketPlan && PLAN_RATE_USD[companyRow.activeTicketPlan]) {
          const rateUsd = PLAN_RATE_USD[companyRow.activeTicketPlan];
          await (prisma as any).coordinatorTicketCharge.create({
            data: {
              companyId: companyRow.id,
              ticketId: ticket.id,
              plan: companyRow.activeTicketPlan,
              rateUsd,
              amountUsd: rateUsd,
            },
          });
        }
      }
    }

    try {
      const db = prisma as { ticketStatusLog?: { create: (args: { data: { visitorRequestId: string; status: string } }) => Promise<unknown> } };
      if (db.ticketStatusLog?.create) {
        await db.ticketStatusLog.create({
          data: { visitorRequestId: ticket.id, status: 'PENDING' },
        });
      }
    } catch (_) {
      /* ignore */
    }

    if (
      !coordinatorContext &&
      payload?.requesterId &&
      embedSiteLat !== undefined &&
      embedSiteLng !== undefined &&
      siteName
    ) {
      const siteProvince =
        province && province.trim() && province.trim() !== 'N/A'
          ? province.trim()
          : 'Baghdad';
      try {
        await prisma.site.upsert({
          where: {
            requesterId_siteId: {
              requesterId: payload.requesterId,
              siteId: siteName,
            },
          },
          create: {
            requesterId: payload.requesterId,
            siteId: siteName,
            location: siteCoordinator,
            province: siteProvince,
            latitude: embedSiteLat,
            longitude: embedSiteLng,
          },
          update: {
            location: siteCoordinator,
            province: siteProvince,
            latitude: embedSiteLat,
            longitude: embedSiteLng,
          },
        });
      } catch (e) {
        console.warn('POST /api/tickets: site upsert skipped', e);
      }
    }

    if (!payload) {
      const username = generateUsername();
      const plainPassword = generatePassword();
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      try {
        const requester = await prisma.ticketRequester.create({
          data: {
            username,
            passwordHash,
            name: name || null,
            email: null,
            phone,
            serviceSlug,
          },
        });
        try {
          await prisma.visitorRequest.update({
            where: { id: ticket.id },
            data: { requesterId: requester.id },
          });
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }

      try {
        if (typeof prisma.notification?.create === 'function') {
          await prisma.notification.create({
            data: {
              type: 'new_ticket',
              title: 'New ticket submitted',
              message: `Ticket from ${name || phone}: ${siteName} - ${siteCoordinator}`,
              ticketId: ticket.id,
              forAdmin: true,
            },
          });
        }
      } catch (e) {
        console.error('Create new-ticket notification:', e);
      }

      notifyTicketsTicket({
        id: ticket.id,
        siteName,
        siteCoordinator,
        technique,
        requesterName: name || null,
        phone,
        status: 'PENDING',
      });

      if (serviceSlug === 'quality-control-supervision') {
        if (ticketIsMaintenanceKind) {
          notifyTechniciansNewTicket(ticket.id, province, siteName).catch(() => {});
        } else {
          notifyEngineersNewTicket(ticket.id, province, siteName).catch(() => {});
        }
      }

      return NextResponse.json({
        success: true,
        ticket: {
          id: ticket.id,
          siteName,
          siteCoordinator,
          slaHours: slaHours > 0 ? slaHours : null,
          technique,
          status: 'PENDING',
        },
        credentials: { username, password: plainPassword },
      });
    }

    try {
      if (typeof prisma.notification?.create === 'function') {
        await prisma.notification.create({
          data: {
            type: 'new_ticket',
            title: 'New ticket submitted',
            message: `Ticket from dashboard: ${siteName} - ${siteCoordinator}`,
            ticketId: ticket.id,
            forAdmin: true,
          },
        });
      }
    } catch (e) {
      console.error('Create new-ticket notification:', e);
    }

    notifyTicketsTicket({
      id: ticket.id,
      siteName,
      siteCoordinator,
      technique,
      requesterName: ((requester as { name?: string | null })?.name ?? name) || null,
      phone,
      status: 'PENDING',
    });

    if (serviceSlug === 'quality-control-supervision') {
      const notifyOpenPoolDirectoryOnly =
        !!creatorPrivateWorkspaceId &&
        assignmentScope !== 'PRIVATE_COMPANY_STAFF' &&
        !privateCompanyIdForTicket;
      if (assignmentScope === 'PRIVATE_COMPANY_STAFF' && privateCompanyIdForTicket) {
        notifyPrivateCompanyMembersNewTicket(
          ticket.id,
          privateCompanyIdForTicket,
          technique,
          province,
          siteName,
          {
            maintenanceStyle: ticketIsMaintenanceKind,
            targetDepartmentId: privateCompanyTargetDepartmentId,
          }
        ).catch(() => {});
      } else if (ticketIsMaintenanceKind) {
        notifyTechniciansNewTicket(ticket.id, province, siteName, {
          directoryOnly: notifyOpenPoolDirectoryOnly,
        }).catch(() => {});
      } else {
        notifyEngineersNewTicket(ticket.id, province, siteName, {
          directoryOnly: notifyOpenPoolDirectoryOnly,
        }).catch(() => {});
      }
    }

    const requesterEmail = (requester as { email?: string | null })?.email;
    if (requesterEmail && typeof requesterEmail === 'string' && requesterEmail.trim()) {
      sendTicketNotificationEmail({
        to: requesterEmail.trim(),
        type: 'new_ticket',
        ticketId: ticket.id,
        summary: `${siteName} - ${siteCoordinator}`,
      }).catch((e) => console.error('Ticket email notification:', e));
    }

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        siteName,
        siteCoordinator,
        slaHours: slaHours > 0 ? slaHours : null,
        technique,
        status: 'PENDING',
      },
    });
  } catch (error) {
    const err = error as Error & { code?: string };
    const errMsg = err?.message ?? String(error);
    console.error('POST /api/tickets:', errMsg);
    // Always return a clear message; in development include details
    let message = 'Failed to create ticket. Please try again.';
    if (process.env.NODE_ENV === 'development') {
      message = errMsg;
    } else if (err?.code === 'P2002') {
      message = 'A ticket with this data already exists.';
    } else if (err?.code === 'P2003') {
      message = 'Invalid reference. Please refresh and try again.';
    }
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = getRequesterFromRequest(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }
    const payload = auth.payload;
    const coordinatorContext = await getCoordinatorContext(req);

    try {
      await sweepExpiredMaintenanceAwaitingConfirmations(prisma);
    } catch {
      /* Non-fatal: list still loads; next GET can finalize expired awaiting confirmations. */
    }

    if (coordinatorContext) {
      const { searchParams } = new URL(req.url);
      const from = searchParams.get('from');
      const to = searchParams.get('to');
      const siteNameParam = searchParams.get('siteName')?.trim() || undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = coordinatorRoleTicketWhere(
        coordinatorContext.companyId,
        coordinatorContext.role,
        coordinatorContext.departments
      );
      if (from) {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        where.createdAt = { ...(where.createdAt ?? {}), gte: d };
      }
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        where.createdAt = { ...(where.createdAt ?? {}), lte: d };
      }
      if (siteNameParam) {
        where.company = { contains: siteNameParam };
      }

      const rows = await prisma.visitorRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          technique: true,
          company: true,
          status: true,
          createdAt: true,
          requesterId: true,
          taskCategory: true,
          roleScope: true,
          workflowState: true,
          assignmentScope: true,
          checklistTemplateId: true,
          assigneeCoordinatorUserId: true,
          coordinatorCompanyId: true,
          resubmitReason: true,
          resubmittedAt: true,
        },
      });

      const tickets = rows.map((r: any) => {
        let siteName: string | null = null;
        let siteCoordinator: string | null = null;
        let slaHours: number | null = null;
        let status = r.status ?? 'PENDING';
        try {
          const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {};
          if (parsed._ticket) {
            siteName = parsed.siteName ?? null;
            siteCoordinator = parsed.siteCoordinator ?? null;
            slaHours = parsed.slaHours ?? null;
            if (parsed.status) status = String(parsed.status);
          }
        } catch {
          /* ignore */
        }
        return {
          id: r.id,
          siteName,
          siteCoordinator,
          slaHours,
          technique: r.technique,
          status,
          createdAt: r.createdAt,
          taskCategory: r.taskCategory ?? null,
          roleScope: r.roleScope ?? null,
          workflowState: r.workflowState ?? 'OPEN',
          assignmentScope: r.assignmentScope ?? null,
          checklistTemplateId: r.checklistTemplateId ?? null,
          assigneeCoordinatorUserId: r.assigneeCoordinatorUserId ?? null,
          coordinatorCompanyId: r.coordinatorCompanyId ?? null,
          resubmitReason: r.resubmitReason ?? null,
          resubmittedAt: r.resubmittedAt ?? null,
        };
      });

      return NextResponse.json({ success: true, tickets });
    }

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: {
        serviceSlug: true,
        role: true,
        name: true,
        username: true,
        email: true,
        province: true,
        provinceFilterActive: true,
        privateCompanyId: true,
        privateCompanyOwned: { select: { id: true, status: true } },
        specialization: true,
      },
    });
    if (!requester) {
      return NextResponse.json(
        { success: false, message: 'Requester not found' },
        { status: 401 }
      );
    }
    const requesterServiceSlug = (requester as { serviceSlug?: string }).serviceSlug ?? 'enterprise-networking';
    const requesterRole = (requester as { role?: string }).role ?? 'COMPANY';
    const requesterProvince = (requester as { province?: string | null }).province ?? null;
    const provinceFilterActive = (requester as { provinceFilterActive?: boolean }).provinceFilterActive ?? true;
    const requesterSpecialization = (requester as { specialization?: string | null }).specialization ?? null;

    // Private-company workspace: when the requester is the owner of an APPROVED workspace OR
    // a staff member, their ticket view is widened to every member of that workspace.
    const ownedPrivateCompanyId =
      (requester as { privateCompanyOwned?: { id: string; status: string } | null }).privateCompanyOwned?.status === 'APPROVED'
        ? (requester as { privateCompanyOwned?: { id: string } | null }).privateCompanyOwned?.id ?? null
        : null;
    const staffPrivateCompanyId = (requester as { privateCompanyId?: string | null }).privateCompanyId ?? null;
    const privateCompanyId = ownedPrivateCompanyId ?? staffPrivateCompanyId;
    let privateCompanyMemberIds: string[] = [];
    if (privateCompanyId) {
      try {
        const members = await prisma.ticketRequester.findMany({
          where: {
            OR: [
              { privateCompanyOwned: { is: { id: privateCompanyId } } },
              { privateCompanyId },
            ],
          },
          select: { id: true },
        });
        privateCompanyMemberIds = (members as Array<{ id: string }>).map((m) => m.id);
      } catch (_) {
        privateCompanyMemberIds = [];
      }
    }

    const { searchParams } = new URL(req.url);
    const doExport = searchParams.get('export') === '1';
    const exportFormat = (searchParams.get('format') || 'json').toLowerCase();
    const from = searchParams.get('from'); // YYYY-MM-DD
    const to = searchParams.get('to');     // YYYY-MM-DD
    const siteNameParam = searchParams.get('siteName')?.trim() || undefined;
    const dashboardSlug = searchParams.get('serviceSlug')?.trim()?.toLowerCase() || undefined;
    const validSlugs = ['quality-control-supervision', 'enterprise-networking'];
    const filterServiceSlug = dashboardSlug && validSlugs.includes(dashboardSlug)
      ? dashboardSlug
      : requesterServiceSlug;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any;

    // Workspace scoping for staff (engineer/technician/worker): PRIVATE_COMPANY_STAFF
    // tickets stay inside their workspace; everyone else sees only public tickets.
    const myStaffWorkspaceId = staffPrivateCompanyId;
    const privateCompanyTicketScope = myStaffWorkspaceId
      ? {
          OR: [
            { assignmentScope: { not: 'PRIVATE_COMPANY_STAFF' as const } },
            { privateCompanyId: myStaffWorkspaceId },
          ],
        }
      : { OR: [{ assignmentScope: { not: 'PRIVATE_COMPANY_STAFF' as const } }, { privateCompanyId: null }] };

    let engineerMaintenanceDeptIds: string[] = [];
    if (myStaffWorkspaceId && isQcPoolEngineerRole(requesterRole)) {
      try {
        const ed = await prisma.privateCompanyDepartment.findMany({
          where: {
            companyId: myStaffWorkspaceId,
            maintenanceDispatchMode: MAINTENANCE_DISPATCH_ENGINEER,
          },
          select: { id: true },
        });
        engineerMaintenanceDeptIds = (ed as Array<{ id: string }>).map((e) => e.id);
      } catch {
        engineerMaintenanceDeptIds = [];
      }
    }

    if (isQcPoolEngineerRole(requesterRole)) {
      // Engineers: QC pool tickets, plus workspace maintenance tickets for departments
      // where the owner set "engineer assigns technician" (same province / specialization rules).
      const pendingFilter: Record<string, unknown> = { status: 'PENDING' };
      if (provinceFilterActive && requesterProvince?.trim()) {
        pendingFilter.province = {
          equals: requesterProvince.trim(),
          mode: 'insensitive',
        };
      }
      const engineerAnd: Record<string, unknown>[] = [
        {
          OR: [pendingFilter, { company: { contains: payload.requesterId } }],
        },
        privateCompanyTicketScope,
      ];
      if (requesterSpecialization) {
        engineerAnd.push({
          OR: [
            { specializationTags: { isEmpty: true } },
            { specializationTags: { has: requesterSpecialization } },
          ],
        });
      }
      const qcBlock = {
        technique: { notIn: MAINTENANCE_TECHNIQUES },
        AND: engineerAnd,
      };
      const maintBlocks: Record<string, unknown>[] = [];
      if (myStaffWorkspaceId && engineerMaintenanceDeptIds.length > 0) {
        for (const deptId of engineerMaintenanceDeptIds) {
          maintBlocks.push({
            technique: { in: MAINTENANCE_TECHNIQUES },
            assignmentScope: 'PRIVATE_COMPANY_STAFF' as const,
            privateCompanyId: myStaffWorkspaceId,
            privateCompanyTargetDepartmentId: deptId,
            AND: [...engineerAnd],
          });
        }
      }
      if (maintBlocks.length > 0) {
        where = {
          serviceSlug: filterServiceSlug,
          OR: [qcBlock, ...maintBlocks],
        };
      } else {
        where = {
          serviceSlug: filterServiceSlug,
          ...qcBlock,
        };
      }
    } else if (requesterRole === 'TECHNICIAN') {
      // Technicians: maintenance only. Pending pool uses province for open-market rows; workspace
      // PRIVATE_COMPANY_STAFF pending rows are matched without province in SQL, then filtered in memory.
      const pendingWithProvince: Record<string, unknown> = { status: 'PENDING' };
      if (provinceFilterActive && requesterProvince?.trim()) {
        pendingWithProvince.province = {
          equals: requesterProvince.trim(),
          mode: 'insensitive',
        };
      }
      const technicianPendingOr: Record<string, unknown>[] = [
        pendingWithProvince,
        { company: { contains: payload.requesterId } },
      ];
      if (myStaffWorkspaceId) {
        technicianPendingOr.push({
          status: 'PENDING',
          OR: [
            { assignmentScope: 'PRIVATE_COMPANY_STAFF' },
            { assignmentScope: null },
          ],
          privateCompanyId: myStaffWorkspaceId,
        });
        technicianPendingOr.push({
          status: { in: ['ON_SITE', 'IN_PROGRESS'] },
          OR: [
            { assignmentScope: 'PRIVATE_COMPANY_STAFF' },
            { assignmentScope: null },
          ],
          privateCompanyId: myStaffWorkspaceId,
        });
      }
      const technicianAnd: Record<string, unknown>[] = [
        { OR: technicianPendingOr },
        privateCompanyTicketScope,
      ];
      if (requesterSpecialization) {
        technicianAnd.push({
          OR: [{ specializationTags: { isEmpty: true } }, { specializationTags: { has: requesterSpecialization } }],
        });
      }
      where = {
        serviceSlug: filterServiceSlug,
        AND: technicianAnd,
      };
    } else if (requesterRole === 'WORKER') {
      // Workers see ONLY tickets assigned to them by admin (assignedEngineerId in company JSON)
      where = {
        serviceSlug: filterServiceSlug,
        company: { contains: payload.requesterId },
        AND: [privateCompanyTicketScope],
      };
    } else {
      // COMPANY / MANAGER / COORDINATOR / etc.: own requester tickets plus coordinator-company
      // tickets when linked (same owner). Private-company members ALL share the same view.
      const linkedCompanyId =
        requesterRole === 'COMPANY'
          ? await getLinkedCoordinatorCompanyId(prisma, {
              id: payload.requesterId,
              username: (requester as { username?: string }).username ?? '',
              email: (requester as { email?: string | null }).email ?? null,
              role: requesterRole,
            })
          : null;
      const ownedRequesterIds = privateCompanyMemberIds.length > 0
        ? privateCompanyMemberIds
        : [payload.requesterId];
      if (linkedCompanyId) {
        where = {
          serviceSlug: filterServiceSlug,
          OR: [
            { requesterId: { in: ownedRequesterIds } },
            { coordinatorCompanyId: linkedCompanyId },
          ],
        };
      } else {
        where = {
          serviceSlug: filterServiceSlug,
          requesterId: { in: ownedRequesterIds },
        };
      }
      if (requesterRole === 'COMPANY' || requesterRole === 'PERSONAL') {
        await applySharedSiteTicketsToVisitorWhere(prisma, payload.requesterId, filterServiceSlug, where);
      }
    }

    if (!doExport) {
      if (from) {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        where.createdAt = { ...(where.createdAt as object ?? {}), gte: d };
      }
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        where.createdAt = { ...(where.createdAt as object ?? {}), lte: d };
      }
      if (siteNameParam) {
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: [{ company: { contains: siteNameParam } }] }];
          delete where.OR;
        } else {
          where.OR = [{ company: { contains: siteNameParam } }];
        }
      }
    }

    const rows = await prisma.visitorRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        technique: true,
        company: true,
        status: true,
        province: true,
        createdAt: true,
        requesterId: true,
        privateCompanyId: true,
        assignmentScope: true,
        privateCompanyTargetDepartmentId: true,
      },
    });

    let rowsForList = rows as Array<{
      id: string;
      technique: string;
      company: string | null;
      status: string;
      province: string;
      createdAt: Date;
      requesterId: string | null;
      privateCompanyId: string | null;
      assignmentScope: string | null;
      privateCompanyTargetDepartmentId: string | null;
    }>;
    if (requesterRole === 'TECHNICIAN') {
      rowsForList = await filterRowsToMaintenanceTickets(prisma, rowsForList, myStaffWorkspaceId);
    }
    if (
      myStaffWorkspaceId &&
      (isQcPoolEngineerRole(requesterRole) || requesterRole === 'TECHNICIAN')
    ) {
      const [techRows, meRow] = await Promise.all([
        fetchWorkspaceTechniqueRows(prisma, myStaffWorkspaceId),
        prisma.ticketRequester.findUnique({
          where: { id: payload.requesterId },
          select: {
            privateCompanyDepartmentId: true,
            privateCompanyAllowedTaskSlugs: true,
          },
        }),
      ]);
      const deptId = (meRow as { privateCompanyDepartmentId?: string | null } | null)?.privateCompanyDepartmentId ?? null;
      const allowedSlugsRaw = (meRow as { privateCompanyAllowedTaskSlugs?: string[] | null } | null)?.privateCompanyAllowedTaskSlugs;
      const allowedSlugs = Array.isArray(allowedSlugsRaw) ? allowedSlugsRaw : [];
      let engineerAvailabilityPoolEnabled = true;
      let technicianAvailabilityPoolEnabled = true;
      if (deptId) {
        const drow = await prisma.privateCompanyDepartment.findFirst({
          where: { id: deptId, companyId: myStaffWorkspaceId },
          select: {
            engineerAvailabilityPoolEnabled: true,
            technicianAvailabilityPoolEnabled: true,
          },
        });
        if (drow) {
          engineerAvailabilityPoolEnabled = drow.engineerAvailabilityPoolEnabled !== false;
          technicianAvailabilityPoolEnabled = drow.technicianAvailabilityPoolEnabled !== false;
        }
      }
      const maintDeptIdsForDispatch = [
        ...new Set(
          rowsForList
            .filter((r) => {
              const scope = r.assignmentScope ?? null;
              return (
                r.privateCompanyId === myStaffWorkspaceId &&
                (scope === 'PRIVATE_COMPANY_STAFF' || scope === null) &&
                !!r.privateCompanyTargetDepartmentId
              );
            })
            .map((r) => r.privateCompanyTargetDepartmentId as string)
        ),
      ];
      let dispatchModeByDeptId = new Map<string, string>();
      if (maintDeptIdsForDispatch.length > 0) {
        try {
          const drows = await prisma.privateCompanyDepartment.findMany({
            where: { companyId: myStaffWorkspaceId, id: { in: maintDeptIdsForDispatch } },
            select: { id: true, maintenanceDispatchMode: true },
          });
          dispatchModeByDeptId = new Map(
            (drows as Array<{ id: string; maintenanceDispatchMode?: string | null }>).map((d) => [
              d.id,
              normalizeMaintenanceDispatchMode(d.maintenanceDispatchMode),
            ])
          );
        } catch {
          dispatchModeByDeptId = new Map();
        }
      }
      rowsForList = rowsForList.filter((r) => {
        const pcId = r.privateCompanyId ?? null;
        const scope = r.assignmentScope ?? null;
        const isWorkspaceStaffRow =
          pcId === myStaffWorkspaceId &&
          (scope === 'PRIVATE_COMPANY_STAFF' || scope === null);
        if (!isWorkspaceStaffRow) return true;
        const parsed = parseTicketCompanyJson(r.company);
        if (ticketFieldStaffInvolvesRequester(parsed, payload.requesterId)) return true;
        const targetDept = r.privateCompanyTargetDepartmentId ?? null;
        if (targetDept && deptId && targetDept !== deptId) return false;
        const allowedByTechnique = staffTicketTechniqueAllowed({
          technique: r.technique,
          staffDepartmentId: deptId,
          staffAllowedSlugs: allowedSlugs,
          workspaceRows: techRows,
        });
        if (!allowedByTechnique) return false;
        const pendingUnassigned =
          String(r.status).toUpperCase() === 'PENDING' && !assignedStaffIdFromCompanyJson(parsed);
        if (
          pendingUnassigned &&
          requesterRole === 'TECHNICIAN' &&
          provinceFilterActive &&
          requesterProvince?.trim()
        ) {
          const ticketProv = String(r.province ?? '').trim();
          if (
            ticketProv &&
            ticketProv.toLowerCase() !== requesterProvince.trim().toLowerCase()
          ) {
            return false;
          }
        }
        if (pendingUnassigned) {
          // Technician availability pool only restricts self-assign (assign route), not list visibility.
          if (isQcPoolEngineerRole(requesterRole) && !engineerAvailabilityPoolEnabled) {
            const isMaint = MAINTENANCE_TECHNIQUES.includes((r.technique ?? '').toLowerCase());
            const td = r.privateCompanyTargetDepartmentId;
            const viaEngineerDispatch =
              !!td && dispatchModeByDeptId.get(td) === MAINTENANCE_DISPATCH_ENGINEER;
            if (!isMaint || !viaEngineerDispatch) return false;
          }
        }
        if (
          pendingUnassigned &&
          requesterRole === 'TECHNICIAN' &&
          targetDept &&
          dispatchModeByDeptId.get(targetDept) === MAINTENANCE_DISPATCH_ENGINEER
        ) {
          return false;
        }
        return true;
      });
    }

    const ticketIds = rowsForList.map((r: { id: string }) => r.id);
    let logsByTicket: Record<string, { status: string; createdAt: Date }[]> = {};
    if (ticketIds.length > 0) {
      try {
        const logs = await prisma.ticketStatusLog.findMany({
          where: { visitorRequestId: { in: ticketIds } },
          orderBy: { createdAt: 'asc' },
          select: { visitorRequestId: true, status: true, createdAt: true },
        });
        for (const log of logs) {
          const id = log.visitorRequestId;
          if (!logsByTicket[id]) logsByTicket[id] = [];
          logsByTicket[id].push({ status: String(log.status), createdAt: log.createdAt });
        }
      } catch {
        /* TicketStatusLog table may not exist yet */
      }
    }

    type Row = {
      id: string;
      technique: string;
      company: string | null;
      status: string;
      createdAt: Date;
      requesterId: string | null;
      privateCompanyId?: string | null;
      assignmentScope?: string | null;
      privateCompanyTargetDepartmentId?: string | null;
    };
    const tickets = rowsForList.map((r: Row) => {
      const row = r as { status?: string };
      let siteName: string | null = null;
      let siteCoordinator: string | null = null;
      let slaHours: number | null = null;
      let status = row.status ?? 'PENDING';
      let completedAt: string | null = null;
      let designSpecifications: string | null = null;
      let attachmentUrls: string[] = [];
      let inspectionResult: string | null = null;
      let ncrReason: string | null = null;
      let ncrImageUrls: string[] = [];
      let ncrResubmissions: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }> = [];
      let assignedEngineerId: string | null = null;
      let assignedEngineerName: string | null = null;
      let assignedAt: string | null = null;
      try {
        const parsed = typeof r.company === 'string' ? JSON.parse(r.company) : {} as Record<string, unknown>;
        if (parsed._ticket) {
          siteName = (parsed.siteName as string) ?? null;
          siteCoordinator = (parsed.siteCoordinator as string) ?? null;
          slaHours = (parsed.slaHours as number) ?? null;
          if (parsed.status) status = String(parsed.status);
          if (parsed.completedAt) completedAt = String(parsed.completedAt);
          designSpecifications = (parsed.designSpecifications as string) ?? null;
          attachmentUrls = Array.isArray(parsed.attachmentUrls) ? parsed.attachmentUrls.filter((u: unknown) => typeof u === 'string') : [];
          inspectionResult = typeof parsed.inspectionResult === 'string' ? parsed.inspectionResult : null;
          ncrReason = (parsed.ncrReason as string) ?? null;
          ncrImageUrls = Array.isArray(parsed.ncrImageUrls) ? parsed.ncrImageUrls.filter((u: unknown) => typeof u === 'string') : [];
          ncrResubmissions = Array.isArray(parsed.ncrResubmissions)
            ? (parsed.ncrResubmissions as Array<{ at?: string; by?: string; action?: string; comment?: string; imageUrls?: string[] }>).map((e) => ({ at: e.at || '', by: e.by || '', action: e.action || 'resubmit', comment: e.comment ?? null, imageUrls: Array.isArray(e.imageUrls) ? e.imageUrls : [] }))
            : [];
          assignedEngineerId = typeof parsed.assignedEngineerId === 'string' ? parsed.assignedEngineerId : null;
          assignedEngineerName = typeof parsed.assignedEngineerName === 'string' ? parsed.assignedEngineerName : null;
          assignedAt = typeof parsed.assignedAt === 'string' ? parsed.assignedAt : null;
        }
      } catch {
        /* ignore */
      }
      const logs = logsByTicket[r.id] ?? [];
      const statusTimeline =
        logs.length > 0
          ? logs
          : [{ status: status as string, createdAt: r.createdAt }];
      statusTimeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return {
        id: r.id,
        siteName,
        siteCoordinator,
        slaHours,
        technique: r.technique,
        status,
        createdAt: r.createdAt,
        completedAt,
        designSpecifications: designSpecifications || null,
        attachmentUrls: attachmentUrls || [],
        inspectionResult: inspectionResult || null,
        ncrReason: ncrReason || null,
        ncrImageUrls,
        ncrResubmissions,
        assignedEngineerId,
        assignedEngineerName,
        assignedAt,
        statusTimeline: statusTimeline.map((e) => ({ status: e.status, createdAt: e.createdAt })),
        requesterId: r.requesterId ?? null,
        privateCompanyId: r.privateCompanyId ?? null,
        assignmentScope: r.assignmentScope ?? null,
        privateCompanyTargetDepartmentId: r.privateCompanyTargetDepartmentId ?? null,
      };
    });

    // If filtering by siteName, keep only tickets whose siteName matches (we filtered by OR on DB but company contains is loose)
    type TicketRow = { id: string; siteName: string | null; siteCoordinator: string | null; slaHours: number | null; technique: string; status: string; createdAt: Date; completedAt: string | null; designSpecifications?: string | null; attachmentUrls?: string[]; inspectionResult?: string | null; ncrReason?: string | null; ncrImageUrls?: string[]; ncrResubmissions?: Array<{ at: string; by: string; action: string; comment?: string | null; imageUrls?: string[] }>; statusTimeline?: { status: string; createdAt: Date }[] };
    const filtered = siteNameParam && !doExport
      ? tickets.filter((t: TicketRow) => t.siteName?.toLowerCase().includes(siteNameParam.toLowerCase()))
      : tickets;

    if (doExport) {
      const slugLabel = filterServiceSlug === 'quality-control-supervision' ? 'quality' : 'network';
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `dashboard-${slugLabel}-export-${dateStr}.${exportFormat === 'csv' ? 'csv' : 'json'}`;
      if (exportFormat === 'csv') {
        const headers = ['id', 'siteName', 'siteCoordinator', 'technique', 'status', 'createdAt', 'completedAt', 'slaHours', 'inspectionResult', 'ncrReason', 'ncrResubmissionsCount'];
        const escape = (v: unknown) => (v == null ? '' : String(v).replace(/"/g, '""'));
        const row = (t: TicketRow) => {
          const ncrResubmissionsCount = Array.isArray(t.ncrResubmissions) ? t.ncrResubmissions.length : 0;
          return headers.map((h) => (h === 'ncrResubmissionsCount' ? `"${ncrResubmissionsCount}"` : `"${escape((t as Record<string, unknown>)[h])}"`)).join(',');
        };
        const csv = [headers.join(','), ...(filtered as TicketRow[]).map(row)].join('\n');
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
      const exportData = { success: true, serviceSlug: filterServiceSlug, exportedAt: new Date().toISOString(), tickets: filtered };
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ success: true, tickets: filtered });
  } catch (error) {
    const err = error as Error;
    console.error('GET /api/tickets:', err?.message ?? err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}
