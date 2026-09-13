import { prisma as _prisma } from '@/lib/prisma';
import {
  workspaceTicketQuotaReached,
  type WorkspaceBillingInput,
} from '@/lib/private-company-billing';
import { logPrivateCompanyWorkspaceActivity } from '@/lib/private-company-workspace-log';
import type { ToolResult } from '@/lib/agent/tools/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function parseCompany(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export async function executeApprovedCreateTicket(
  payload: Record<string, unknown>,
  ctxHints?: { actorId?: string }
): Promise<ToolResult> {
  const technique = String(payload.technique || '').trim();
  const privateCompanyId = String(payload.privateCompanyId || '').trim();
  const requesterId = String(payload.requesterId || ctxHints?.actorId || '').trim();
  if (!technique || !privateCompanyId || !requesterId) {
    return { ok: false, message: 'Invalid create_ticket payload' };
  }

  const company = await prisma.privateCompany.findUnique({
    where: { id: privateCompanyId },
    select: {
      id: true,
      freeTicketsLimit: true,
      ticketsUsed: true,
      ticketCreditsTotal: true,
      unlimitedUntil: true,
    },
  });
  if (workspaceTicketQuotaReached(company as WorkspaceBillingInput)) {
    return { ok: false, message: 'Quota reached at execution time.' };
  }

  const companyJson = {
    siteName: payload.siteName ?? null,
    province: payload.province ?? null,
    notes: payload.notes ?? null,
    category: payload.category ?? null,
    createdVia: 'u_agent',
    status: 'PENDING',
  };

  const requester = await prisma.ticketRequester.findUnique({
    where: { id: requesterId },
    select: { phone: true, province: true, name: true },
  });

  const ticket = await prisma.visitorRequest.create({
    data: {
      technique,
      status: 'PENDING',
      requesterId,
      privateCompanyId,
      phone: requester?.phone || '0000000000',
      province: String(payload.province || requester?.province || 'Baghdad'),
      name: requester?.name || null,
      siteName: typeof payload.siteName === 'string' ? payload.siteName : null,
      company: JSON.stringify(companyJson),
      assignmentScope: 'PRIVATE_COMPANY_STAFF',
      serviceSlug: 'quality-control-supervision',
    },
    select: { id: true },
  });

  try {
    await prisma.privateCompany.update({
      where: { id: privateCompanyId },
      data: { ticketsUsed: { increment: 1 } },
    });
  } catch {
    // billing columns may be missing on legacy DB
  }

  logPrivateCompanyWorkspaceActivity({
    companyId: privateCompanyId,
    actorRequesterId: requesterId,
    action: 'TICKET_CREATED',
    resourceType: 'ticket',
    resourceId: ticket.id,
    summary: `U Agent created ticket ${ticket.id} (${technique})`,
    metadata: { source: 'u_agent' },
  });

  return { ok: true, message: `Ticket created: ${ticket.id}`, data: { ticketId: ticket.id } };
}

export async function executeApprovedAssignTicket(
  payload: Record<string, unknown>
): Promise<ToolResult> {
  const ticketId = String(payload.ticketId || '').trim();
  const assigneeRequesterId = String(payload.assigneeRequesterId || '').trim();
  if (!ticketId || !assigneeRequesterId) {
    return { ok: false, message: 'Invalid assign payload' };
  }

  const row = await prisma.visitorRequest.findUnique({
    where: { id: ticketId },
    select: { id: true, company: true, status: true, privateCompanyId: true },
  });
  if (!row) return { ok: false, message: 'Ticket not found' };

  const assignee = await prisma.ticketRequester.findUnique({
    where: { id: assigneeRequesterId },
    select: { id: true, name: true, username: true },
  });
  if (!assignee) return { ok: false, message: 'Assignee not found' };

  const parsed = parseCompany(row.company);
  parsed.assignedEngineerId = assignee.id;
  parsed.assignedEngineerName = assignee.name || assignee.username;
  parsed.assignedAt = new Date().toISOString();

  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: {
      company: JSON.stringify(parsed),
      status: row.status === 'PENDING' ? 'PENDING' : row.status,
    },
  });

  return {
    ok: true,
    message: `Assigned ${ticketId} to ${parsed.assignedEngineerName}`,
    data: { ticketId, assigneeRequesterId },
  };
}

export async function executeApprovedConflictReport(
  payload: Record<string, unknown>
): Promise<ToolResult> {
  const ticketId = String(payload.ticketId || '').trim();
  const result = String(payload.result || '').trim();
  const actorId = String(payload.actorId || '').trim();
  if (!ticketId || !result) return { ok: false, message: 'Invalid conflict payload' };

  const row = await prisma.visitorRequest.findFirst({
    where: actorId ? { id: ticketId, requesterId: actorId } : { id: ticketId },
    select: { id: true, company: true, technique: true },
  });
  if (!row) return { ok: false, message: 'Ticket not found or not owned by requester' };

  const parsed = parseCompany(row.company);
  parsed.conflictStatus = 'pending';
  parsed.inspectionResult = result;
  parsed.conflictReportedAt = new Date().toISOString();
  parsed.conflictReportedBy = actorId || null;
  if (typeof payload.comment === 'string') parsed.conflictReportComment = payload.comment;
  if (Array.isArray(payload.imageUrls)) parsed.conflictImageUrls = payload.imageUrls;

  await prisma.visitorRequest.update({
    where: { id: ticketId },
    data: { company: JSON.stringify(parsed) },
  });

  return { ok: true, message: `Conflict reported on ${ticketId}`, data: { ticketId, result } };
}
