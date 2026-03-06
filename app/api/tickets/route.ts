import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma as _prisma } from '@/lib/prisma';
import { createRequesterToken, getRequesterCookieOptions, REQUESTER_COOKIE_NAME } from '@/lib/requester-auth';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { getVerifiedPhoneFromCookie } from '@/lib/otp-auth';
import { sendTicketNotificationEmail, sendTicketCompletedEmail, notifyTicketsTicket } from '@/lib/email';

// Cast so TS sees generated delegates (ticketRequester, visitorRequest, notification) after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const ENTERPRISE_TECHNIQUES = ['maintenance', 'fiber', 'cable_systemization', 'closures', 'splice', 'qgis', 'asbuilt_design'];
const QUALITY_CONTROL_TECHNIQUES = ['inspection', 'supervision', 'hse', 'investigation', 'tracking'];
// Maintenance ticket types (technician only): stored as technique
const MAINTENANCE_TECHNIQUES = ['fiber_route', 'fiber_site', 'electrical', 'telecom', 'ftth'];
const ALL_TECHNIQUES = [...ENTERPRISE_TECHNIQUES, ...QUALITY_CONTROL_TECHNIQUES, ...MAINTENANCE_TECHNIQUES];

async function notifyEngineersNewTicket(ticketId: string, province: string, siteName: string) {
  try {
    if (typeof prisma.notification?.create !== 'function') return;
    const engineers = await prisma.ticketRequester.findMany({
      where: {
        role: 'ENGINEER',
        status: 'ACTIVE',
        serviceSlug: 'quality-control-supervision',
      },
      select: { id: true, province: true, provinceFilterActive: true },
    });
    for (const eng of engineers) {
      const filterActive = eng.provinceFilterActive ?? true;
      const engProvince = eng.province ?? null;
      if (filterActive && engProvince && engProvince !== province) continue;
      try {
        await prisma.notification.create({
          data: {
            type: 'new_ticket',
            title: 'New ticket available',
            message: `New QC ticket in ${province}: ${siteName}`,
            ticketId,
            requesterId: eng.id,
            forAdmin: false,
          },
        });
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error('notifyEngineersNewTicket:', e);
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

    if (!siteName || !siteCoordinator || !technique) {
      return NextResponse.json(
        { success: false, message: 'Site name, site location, and technique are required' },
        { status: 400 }
      );
    }

    const auth = getRequesterFromRequest(req);
    const payload = auth?.payload ?? null;
    let requester: { email?: string | null } | null = null;

    if (payload) {
      const reqData = await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: { id: true, phone: true, name: true, company: true, serviceSlug: true, status: true, email: true },
      });
      requester = reqData;
      if (!reqData) {
        return NextResponse.json({ success: false, message: 'Requester not found' }, { status: 401 });
      }
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
    } else {
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

    if (!ALL_TECHNIQUES.includes(technique)) {
      return NextResponse.json(
        { success: false, message: 'Invalid technique' },
        { status: 400 }
      );
    }

    const isMaintenanceTicket = MAINTENANCE_TECHNIQUES.includes(technique);
    if (isMaintenanceTicket && payload) {
      const requesterRole = (await prisma.ticketRequester.findUnique({
        where: { id: payload.requesterId },
        select: { role: true },
      })) as { role?: string } | null;
      const allowedRoles = ['COMPANY', 'PERSONAL'];
      if (!requesterRole?.role || !allowedRoles.includes(requesterRole.role)) {
        return NextResponse.json(
          { success: false, message: 'Only company or personal can create maintenance tickets. Technicians handle them; engineers handle QC only.' },
          { status: 403 }
        );
      }
    }

    if (slaHours < 0 || slaHours > 8760) {
      return NextResponse.json(
        { success: false, message: 'SLA hours must be between 0 and 8760' },
        { status: 400 }
      );
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
      ticketData.requesterId = payload.requesterId;
    }
    if (isMaintenanceTicket && beforeImageUrls.length > 0) {
      ticketData.beforeImageUrls = beforeImageUrls;
    }

    const ticket = await prisma.visitorRequest.create({
      data: ticketData,
    });

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
        notifyEngineersNewTicket(ticket.id, province, siteName).catch(() => {});
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

    if (serviceSlug === 'quality-control-supervision' && !MAINTENANCE_TECHNIQUES.includes(technique)) {
      notifyEngineersNewTicket(ticket.id, province, siteName).catch(() => {});
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

    const requester = await prisma.ticketRequester.findUnique({
      where: { id: payload.requesterId },
      select: { serviceSlug: true, role: true, name: true, province: true, provinceFilterActive: true },
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
    } else {
      // COMPANY: only their tickets (including maintenance they created)
      where = {
        requesterId: payload.requesterId,
        serviceSlug: filterServiceSlug,
      };
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
