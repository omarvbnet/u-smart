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

// Cast so TS sees generated delegates (ticketRequester, visitorRequest, notification) after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ENTERPRISE_TECHNIQUES = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'];
const QUALITY_CONTROL_TECHNIQUES = ['inspection', 'supervision', 'building', 'hse', 'investigation', 'tracking'];
// Maintenance ticket types (technician only): stored as technique
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const ALL_TECHNIQUES = [...ENTERPRISE_TECHNIQUES, ...QUALITY_CONTROL_TECHNIQUES, ...MAINTENANCE_TECHNIQUES];
const TASK_CATEGORY_VALUES = ['MAINTENANCE', 'QUALITY', 'SUPERVISION'];
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

async function notifyRoleNewTicket(
  ticketId: string,
  province: string,
  siteName: string,
  role: 'ENGINEER' | 'TECHNICIAN',
  _roleLabel: string
) {
  try {
    const recipients = await prisma.ticketRequester.findMany({
      where: {
        role,
        status: 'ACTIVE',
        serviceSlug: 'quality-control-supervision',
      },
      select: { id: true, province: true, provinceFilterActive: true },
    });
    const roleKind = role === 'TECHNICIAN' ? 'maintenance' : 'qc';
    for (const recipient of recipients) {
      const filterActive = recipient.provinceFilterActive ?? true;
      const recipientProvince = recipient.province ?? null;
      if (filterActive && recipientProvince && recipientProvince !== province) continue;
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

async function notifyEngineersNewTicket(ticketId: string, province: string, siteName: string) {
  await notifyRoleNewTicket(ticketId, province, siteName, 'ENGINEER', 'QC');
}

async function notifyTechniciansNewTicket(ticketId: string, province: string, siteName: string) {
  await notifyRoleNewTicket(ticketId, province, siteName, 'TECHNICIAN', 'maintenance');
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

    if (!siteName || !siteCoordinator || !technique) {
      return NextResponse.json(
        { success: false, message: 'Site name, site location, and technique are required' },
        { status: 400 }
      );
    }

    const auth = getRequesterFromRequest(req);
    const payload = auth?.payload ?? null;
    const coordinatorContext = payload ? await getCoordinatorContext(req) : null;
    let requester: { email?: string | null } | null = null;
    let requesterRole: string | null = null;

    if (payload && !coordinatorContext) {
      const reqData = await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: { id: true, phone: true, name: true, company: true, serviceSlug: true, status: true, email: true, role: true },
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

    if (!ALL_TECHNIQUES.includes(technique)) {
      return NextResponse.json(
        { success: false, message: 'Invalid technique' },
        { status: 400 }
      );
    }

    // Worker cannot create any tickets – view-only, admin-assigned
    if (payload && !coordinatorContext) {
      if (requesterRole === 'WORKER') {
        return NextResponse.json(
          { success: false, message: 'Workers cannot create tickets. You can only view tickets assigned to you.' },
          { status: 403 }
        );
      }
    }

    const isMaintenanceTicket = MAINTENANCE_TECHNIQUES.includes(technique);
    if (isMaintenanceTicket && payload && !coordinatorContext) {
      const allowedRoles = ['COMPANY', 'PERSONAL'];
      if (!requesterRole || !allowedRoles.includes(requesterRole)) {
        return NextResponse.json(
          { success: false, message: 'Only company or personal can create maintenance tickets. Technicians handle them; engineers handle QC only.' },
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
    let resubmitToRequester = false;

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
    }

    const designSpecifications = typeof body.designSpecifications === 'string' ? body.designSpecifications.trim() : '';
    const attachmentUrls = Array.isArray(body.attachmentUrls) ? body.attachmentUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];
    const maintenanceReason = typeof body.maintenanceReason === 'string' ? body.maintenanceReason.trim() : '';
    const beforeImageUrls = Array.isArray(body.beforeImageUrls) ? body.beforeImageUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];

    const companyPayloadObj: Record<string, unknown> = {
      _ticket: 1,
      siteName,
      siteCoordinator,
      slaHours: slaHours > 0 ? slaHours : null,
      company: company || null,
      designSpecifications: designSpecifications || null,
      attachmentUrls: attachmentUrls.length > 0 ? attachmentUrls : null,
    };
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
    }
    if (isMaintenanceTicket && maintenanceReason) {
      companyPayloadObj.maintenanceReason = maintenanceReason;
    }
    const companyPayload = JSON.stringify(companyPayloadObj);

    const serviceSlug = QUALITY_CONTROL_TECHNIQUES.includes(technique)
      ? 'quality-control-supervision'
      : MAINTENANCE_TECHNIQUES.includes(technique)
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
      coordinatorCompanyId?: string;
      createdByCoordinatorUserId?: string;
      assigneeCoordinatorUserId?: string;
    } = {
      buildingType: 'n/a',
      phone,
      province,
      technique,
      name: name || null,
      company: companyPayload,
      serviceSlug,
      siteName, // so GET /api/sites can count tickets by site
    };

    if (payload) {
      if (coordinatorContext) {
        ticketData.coordinatorCompanyId = coordinatorContext.companyId;
        ticketData.createdByCoordinatorUserId = coordinatorContext.userId;
      } else {
        ticketData.requesterId = payload.requesterId;
      }
    }
    if (isMaintenanceTicket && beforeImageUrls.length > 0) {
      ticketData.beforeImageUrls = beforeImageUrls;
    }
    if (coordinatorContext) {
      if (coordinatorTaskCategory) ticketData.taskCategory = coordinatorTaskCategory;
      if (coordinatorRoleScope) ticketData.roleScope = coordinatorRoleScope;
      ticketData.workflowState = 'OPEN';
      if (assignmentScope) ticketData.assignmentScope = assignmentScope;
      if (checklistTemplateId) ticketData.checklistTemplateId = checklistTemplateId;
      if (assigneeCoordinatorUserId) ticketData.assigneeCoordinatorUserId = assigneeCoordinatorUserId;
    }

    const ticket = await prisma.visitorRequest.create({
      data: ticketData,
    });

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
        if (MAINTENANCE_TECHNIQUES.includes(technique)) {
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
      if (MAINTENANCE_TECHNIQUES.includes(technique)) {
        notifyTechniciansNewTicket(ticket.id, province, siteName).catch(() => {});
      } else {
        notifyEngineersNewTicket(ticket.id, province, siteName).catch(() => {});
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

    if (requesterRole === 'ENGINEER') {
      // Engineers see ONLY QC tickets (inspection, supervision, etc.). Maintenance tickets are for Technicians and Admin only.
      const pendingFilter: any = { status: 'PENDING' };
      if (provinceFilterActive && requesterProvince) {
        pendingFilter.province = requesterProvince;
      }
      where = {
        serviceSlug: filterServiceSlug,
        technique: { notIn: MAINTENANCE_TECHNIQUES },
        OR: [
          pendingFilter,
          { company: { contains: payload.requesterId } },
        ],
      };
    } else if (requesterRole === 'TECHNICIAN') {
      // Technicians see ONLY maintenance tickets
      where = {
        serviceSlug: filterServiceSlug,
        technique: { in: MAINTENANCE_TECHNIQUES },
      };
    } else if (requesterRole === 'WORKER') {
      // Workers see ONLY tickets assigned to them by admin (assignedEngineerId in company JSON)
      where = {
        serviceSlug: filterServiceSlug,
        company: { contains: payload.requesterId },
      };
    } else {
      // COMPANY: own requester tickets plus coordinator-company tickets when linked (same owner)
      const linkedCompanyId =
        requesterRole === 'COMPANY'
          ? await getLinkedCoordinatorCompanyId(prisma, {
              id: payload.requesterId,
              username: (requester as { username?: string }).username ?? '',
              email: (requester as { email?: string | null }).email ?? null,
              role: requesterRole,
            })
          : null;
      if (linkedCompanyId) {
        where = {
          serviceSlug: filterServiceSlug,
          OR: [{ requesterId: payload.requesterId }, { coordinatorCompanyId: linkedCompanyId }],
        };
      } else {
        where = {
          requesterId: payload.requesterId,
          serviceSlug: filterServiceSlug,
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
        createdAt: true,
        requesterId: true,
      },
    });

    const ticketIds = rows.map((r: { id: string }) => r.id);
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
    };
    const tickets = rows.map((r: Row) => {
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
