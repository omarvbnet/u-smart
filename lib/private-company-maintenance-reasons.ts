import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { maintenanceCrewIdsFromCompanyJson } from '@/lib/private-company-kpi';
import { resolveIsMaintenanceVisitorRequest } from '@/lib/maintenance-requester-confirmation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const MAINTENANCE_COMPLETION_REASON_ID_KEY = 'maintenanceCompletionReasonId';
export const MAINTENANCE_COMPLETION_REASON_LABEL_KEY = 'maintenanceCompletionReasonLabel';

const MANAGE_ROLES = new Set(['MANAGER', 'COORDINATOR']);

export function normalizeMaintenanceReasonLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 200) return null;
  return s;
}

export type MaintenanceReasonsGuardSuccess = {
  ok: true;
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
};

export type MaintenanceReasonsGuardFailure = {
  ok: false;
  response: NextResponse;
};

export async function maintenanceReasonsGuard(
  req: NextRequest
): Promise<MaintenanceReasonsGuardSuccess | MaintenanceReasonsGuardFailure> {
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
    if (!MANAGE_ROLES.has(actorRole)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            message: 'Only the workspace owner, managers, or coordinators can manage maintenance reasons.',
          },
          { status: 403 }
        ),
      };
    }
    if (!actorDepartmentId) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            message: 'Your account must be assigned to a department to manage maintenance reasons.',
          },
          { status: 403 }
        ),
      };
    }
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

/** Owner: any department in workspace. Manager/coordinator: own department only. */
export function assertCanManageDepartmentReasons(
  guard: MaintenanceReasonsGuardSuccess,
  departmentId: string
): NextResponse | null {
  if (guard.isOwner) return null;
  if (guard.actorDepartmentId !== departmentId) {
    return NextResponse.json(
      { success: false, message: 'You can only manage maintenance reasons for your department.' },
      { status: 403 }
    );
  }
  return null;
}

export function serializeMaintenanceReason(row: {
  id: string;
  departmentId: string;
  label: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    departmentId: row.departmentId,
    label: row.label,
    sortOrder: row.sortOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Department used for completion-reason lists on a maintenance ticket. */
export async function resolveMaintenanceReasonDepartmentId(ticket: {
  privateCompanyTargetDepartmentId?: string | null;
  privateCompanyId?: string | null;
  company?: string | null;
}): Promise<string | null> {
  if (ticket.privateCompanyTargetDepartmentId) {
    return ticket.privateCompanyTargetDepartmentId;
  }
  try {
    const p = typeof ticket.company === 'string' ? JSON.parse(ticket.company) : {};
    const assignedId =
      typeof p.assignedEngineerId === 'string' ? p.assignedEngineerId.trim() : null;
    if (assignedId) {
      const lead = await prisma.ticketRequester.findUnique({
        where: { id: assignedId },
        select: { privateCompanyDepartmentId: true },
      });
      if (lead?.privateCompanyDepartmentId) return lead.privateCompanyDepartmentId;
    }
    const crew = maintenanceCrewIdsFromCompanyJson(p);
    if (crew.length > 0) {
      const member = await prisma.ticketRequester.findFirst({
        where: { id: { in: crew }, privateCompanyDepartmentId: { not: null } },
        select: { privateCompanyDepartmentId: true },
      });
      if (member?.privateCompanyDepartmentId) return member.privateCompanyDepartmentId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadActiveMaintenanceReasonsForDepartment(
  companyId: string,
  departmentId: string
) {
  return prisma.privateCompanyMaintenanceReason.findMany({
    where: { companyId, departmentId, active: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { id: true, departmentId: true, label: true, sortOrder: true, active: true },
  });
}

export async function loadMaintenanceReasonsForTicket(ticket: {
  id: string;
  technique: string;
  privateCompanyId?: string | null;
  privateCompanyTargetDepartmentId?: string | null;
  company?: string | null;
}) {
  const companyId = ticket.privateCompanyId;
  if (!companyId) return [];
  const isMaint = await resolveIsMaintenanceVisitorRequest(prisma, ticket.technique, companyId);
  if (!isMaint) return [];
  const departmentId = await resolveMaintenanceReasonDepartmentId(ticket);
  if (!departmentId) return [];
  return loadActiveMaintenanceReasonsForDepartment(companyId, departmentId);
}

export function readMaintenanceCompletionReasonFromCompany(parsed: Record<string, unknown>): {
  id: string | null;
  label: string | null;
} {
  const id =
    typeof parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY] === 'string'
      ? parsed[MAINTENANCE_COMPLETION_REASON_ID_KEY].trim()
      : null;
  const label =
    typeof parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY] === 'string'
      ? parsed[MAINTENANCE_COMPLETION_REASON_LABEL_KEY].trim()
      : null;
  return {
    id: id && id.length > 0 ? id : null,
    label: label && label.length > 0 ? label : null,
  };
}

export async function validateMaintenanceCompletionReason(
  companyId: string,
  departmentId: string | null,
  reasonId: unknown
): Promise<{ ok: true; id: string; label: string } | { ok: false; message: string }> {
  if (!departmentId) {
    return { ok: false, message: 'This ticket has no department for maintenance reasons.' };
  }
  const active = await loadActiveMaintenanceReasonsForDepartment(companyId, departmentId);
  if (active.length === 0) {
    return { ok: true, id: '', label: '' };
  }
  const id = typeof reasonId === 'string' ? reasonId.trim() : '';
  if (!id) {
    return {
      ok: false,
      message: 'Select a maintenance completion reason before submitting for confirmation.',
    };
  }
  const row = active.find((r: { id: string }) => r.id === id);
  if (!row) {
    return { ok: false, message: 'Invalid maintenance completion reason.' };
  }
  return { ok: true, id: row.id, label: row.label };
}
