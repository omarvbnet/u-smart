import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import {
  assignedStaffIdFromCompanyJson,
  maintenanceCrewIdsFromCompanyJson,
  parseTicketCompanyJson,
  ticketFieldStaffInvolvesRequester,
} from '@/lib/private-company-kpi';
import { lookupProvisorTechniqueCategory } from '@/lib/provisor-technique-lookup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const CAN_CONFIGURE_EXPENSE_SETTINGS = new Set(['COMPANY', 'MANAGER', 'COORDINATOR']);
export const CAN_ENABLE_EXPENSES_DIRECTLY = new Set(['COMPANY', 'MANAGER']);
export const CAN_APPROVE_EXPENSE_ACTIVATION = new Set(['COMPANY', 'MANAGER']);
export const CAN_SUBMIT_TICKET_EXPENSE_ROLES = new Set([
  'ENGINEER',
  'TECHNICIAN',
  'WORKER',
  'QUALITY_ENGINEER',
  'SUPERVISION_ENGINEER',
]);

export type ExpensesGuardSuccess = {
  ok: true;
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
};

export type ExpensesGuardFailure = {
  ok: false;
  response: NextResponse;
};

export type ExpensesGuardResult = ExpensesGuardSuccess | ExpensesGuardFailure;

export function normalizeExpenseReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (typeof e !== 'string') continue;
    const s = e.trim();
    if (!s || s.length > 200) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 80) break;
  }
  return out;
}

export function parseExpenseAmount(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export async function expensesGuard(req: NextRequest): Promise<ExpensesGuardResult> {
  const auth = getRequesterFromRequest(req);
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: 'Not authenticated.' }, { status: 401 }),
    };
  }
  const m = await getPrivateCompanyMembership(auth.payload.requesterId);
  if (!m.effectiveCompanyId || !m.isActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: 'You are not part of an active private workspace.' },
        { status: 403 }
      ),
    };
  }
  const isOwner =
    !!m.ownedCompanyId &&
    m.ownedCompanyStatus === 'APPROVED' &&
    m.ownedCompanyId === m.effectiveCompanyId;

  let actorRole = 'COMPANY';
  let actorDepartmentId: string | null = null;
  if (!isOwner) {
    const me = await prisma.ticketRequester.findUnique({
      where: { id: auth.payload.requesterId },
      select: { role: true, privateCompanyDepartmentId: true },
    });
    actorRole = String(me?.role ?? '').toUpperCase();
    actorDepartmentId = me?.privateCompanyDepartmentId ?? null;
  }

  return {
    ok: true,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner,
    actorRole,
    actorDepartmentId,
  };
}

export async function loadExpenseSettings(companyId: string) {
  return prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: {
      ticketExpensesEnabled: true,
      ticketExpenseReasons: true,
      ticketExpensesActivationPending: true,
      ticketExpensesActivationRequestedAt: true,
      ticketExpensesActivationRequestedById: true,
      ticketExpensesEnabledAt: true,
      ticketExpensesEnabledById: true,
    },
  });
}

export function serializeExpenseSettings(row: {
  ticketExpensesEnabled?: boolean;
  ticketExpenseReasons?: string[];
  ticketExpensesActivationPending?: boolean;
  ticketExpensesActivationRequestedAt?: Date | null;
  ticketExpensesActivationRequestedById?: string | null;
  ticketExpensesEnabledAt?: Date | null;
  ticketExpensesEnabledById?: string | null;
}) {
  const reasons = Array.isArray(row.ticketExpenseReasons)
    ? row.ticketExpenseReasons.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    enabled: row.ticketExpensesEnabled === true,
    reasons,
    activationPending: row.ticketExpensesActivationPending === true,
    activationRequestedAt: row.ticketExpensesActivationRequestedAt ?? null,
    activationRequestedById: row.ticketExpensesActivationRequestedById ?? null,
    enabledAt: row.ticketExpensesEnabledAt ?? null,
    enabledById: row.ticketExpensesEnabledById ?? null,
  };
}

export type EffectiveTicketExpensePolicy = { enabled: boolean; reasons: string[] };

/**
 * Workspace master switch + per–ticket-type (technique) row: effective enabled flag and preset reasons.
 * When the technique’s reason list is empty, workspace defaults apply.
 */
export async function resolveEffectiveTicketExpensePolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient: any,
  companyId: string,
  techniqueSlug: string | null | undefined
): Promise<EffectiveTicketExpensePolicy> {
  const settings = await loadExpenseSettings(companyId);
  if (!settings?.ticketExpensesEnabled) {
    return { enabled: false, reasons: [] };
  }
  const companyReasons = normalizeExpenseReasons(settings.ticketExpenseReasons);

  const slug = typeof techniqueSlug === 'string' ? techniqueSlug.trim() : '';
  if (!slug) {
    return { enabled: true, reasons: companyReasons };
  }

  const category = await lookupProvisorTechniqueCategory(prismaClient, slug, {
    workspaceCompanyId: companyId,
  });
  if (!category) {
    return { enabled: true, reasons: companyReasons };
  }

  let tech: { ticketExpensesEnabled?: boolean | null; ticketExpenseReasons?: string[] | null } | null =
    null;
  try {
    tech = await prismaClient.privateCompanyTechnique.findFirst({
      where: {
        companyId,
        category,
        active: true,
        slug: { equals: slug, mode: 'insensitive' },
      },
      select: { ticketExpensesEnabled: true, ticketExpenseReasons: true },
    });
  } catch {
    /* legacy DB */
  }

  if (!tech) {
    return { enabled: true, reasons: companyReasons };
  }

  const typeEnabled = tech.ticketExpensesEnabled !== false;
  const typeReasons = normalizeExpenseReasons(tech.ticketExpenseReasons ?? []);
  const reasons = typeReasons.length > 0 ? typeReasons : companyReasons;

  return {
    enabled: typeEnabled,
    reasons,
  };
}

/** Staff may add expenses when feature is on and they are lead or crew on an open ticket. */
export async function canStaffSubmitExpenseOnTicket(
  requesterId: string,
  ticket: {
    id: string;
    status: string | null;
    company: string | null;
    privateCompanyId: string | null;
    assignmentScope: string | null;
    province: string | null;
    privateCompanyTargetDepartmentId: string | null;
    technique: string | null;
  },
  companyId: string
): Promise<
  { ok: true; allowedReasons: string[] } | { ok: false; message: string; status: number }
> {
  const eff = await resolveEffectiveTicketExpensePolicy(prisma, companyId, ticket.technique);
  if (!eff.enabled) {
    return {
      ok: false,
      message: 'Ticket expenses are not enabled for this ticket or type.',
      status: 403,
    };
  }
  if (String(ticket.status ?? '').toUpperCase() === 'COMPLETED') {
    return { ok: false, message: 'Cannot add expenses to a completed ticket.', status: 400 };
  }
  if (!ticket.privateCompanyId || ticket.privateCompanyId !== companyId) {
    return { ok: false, message: 'Ticket is not in your workspace.', status: 403 };
  }
  const scope = ticket.assignmentScope ?? null;
  if (scope !== 'PRIVATE_COMPANY_STAFF' && scope !== null) {
    return { ok: false, message: 'Expenses are only for workspace-scoped tickets.', status: 400 };
  }

  const parsed = parseTicketCompanyJson(ticket.company);
  if (!ticketFieldStaffInvolvesRequester(parsed, requesterId)) {
    const lead = assignedStaffIdFromCompanyJson(parsed);
    const crew = maintenanceCrewIdsFromCompanyJson(parsed);
    if (!lead && crew.length === 0) {
      return {
        ok: false,
        message: 'You must be assigned to this ticket (lead or crew) to log expenses.',
        status: 403,
      };
    }
    return {
      ok: false,
      message: 'Only the assigned lead or crew on this ticket can log expenses.',
      status: 403,
    };
  }

  // Crew-vs-lead policy: department setting `crewCanLogExpenses` decides whether
  // non-lead crew members can submit expenses themselves, or only the lead can.
  const leadId = assignedStaffIdFromCompanyJson(parsed);
  const isLead = leadId != null && leadId === requesterId;
  if (!isLead) {
    const crewIds = maintenanceCrewIdsFromCompanyJson(parsed);
    const isCrewMember = crewIds.includes(requesterId);
    if (isCrewMember && ticket.privateCompanyTargetDepartmentId) {
      try {
        const dept = await prisma.privateCompanyDepartment.findUnique({
          where: { id: ticket.privateCompanyTargetDepartmentId },
          select: { crewCanLogExpenses: true },
        });
        if (dept && dept.crewCanLogExpenses === false) {
          return {
            ok: false,
            message:
              'Your department allows only the assigned lead on the main ticket to log expenses.',
            status: 403,
          };
        }
      } catch {
        /* default permissive on lookup error */
      }
    }
  }
  return { ok: true, allowedReasons: eff.reasons };
}

export function expenseRowToJson(row: {
  id: string;
  ticketId: string;
  staffRequesterId: string;
  amount: number;
  currency: string;
  reason: string;
  note: string | null;
  ticketProvince: string | null;
  departmentId: string | null;
  createdAt: Date;
  staff?: { id: string; name: string | null; username: string } | null;
  ticket?: {
    id: string;
    siteName: string | null;
    technique: string | null;
    status: string;
    province: string | null;
  } | null;
}) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    staffId: row.staffRequesterId,
    staffName: row.staff?.name?.trim() || row.staff?.username || null,
    amount: row.amount,
    currency: row.currency,
    reason: row.reason,
    note: row.note,
    ticketProvince: row.ticketProvince,
    departmentId: row.departmentId,
    createdAt: row.createdAt,
    ticket: row.ticket
      ? {
          id: row.ticket.id,
          siteName: row.ticket.siteName,
          technique: row.ticket.technique,
          status: row.ticket.status,
          province: row.ticket.province,
        }
      : null,
  };
}
