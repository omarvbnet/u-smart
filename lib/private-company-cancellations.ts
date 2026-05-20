import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequesterFromRequest } from '@/lib/get-requester-token';
import { prisma as _prisma } from '@/lib/prisma';
import { getPrivateCompanyMembership } from '@/lib/private-company-context';
import { normalizeExpenseReasons } from '@/lib/private-company-expenses';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const CAN_CONFIGURE_CANCELLATION_REASONS = new Set(['MANAGER', 'COORDINATOR']);

export function canConfigureCancellationReasons(guard: CancellationsGuardSuccess): boolean {
  return guard.isOwner || CAN_CONFIGURE_CANCELLATION_REASONS.has(guard.actorRole);
}

export async function resolveEffectiveCancellationReasons(
  privateCompanyId: string | null | undefined
): Promise<string[]> {
  const cid = privateCompanyId?.trim();
  if (cid) {
    const row = await loadCancellationSettings(cid);
    const workspace = serializeCancellationSettings(row ?? { ticketCancellationReasons: [] }).reasons;
    if (workspace.length > 0) return workspace;
  }
  const { loadPlatformTicketPolicy } = await import('@/lib/platform-ticket-policy');
  const policy = await loadPlatformTicketPolicy();
  return policy.cancellationReasons;
}

export async function ticketCancellationReasonFields(privateCompanyId: string | null | undefined) {
  const cid = privateCompanyId?.trim();
  let workspaceCancellationReasons: string[] = [];
  if (cid) {
    const row = await loadCancellationSettings(cid);
    workspaceCancellationReasons = serializeCancellationSettings(row ?? { ticketCancellationReasons: [] }).reasons;
  }
  const { loadPlatformTicketPolicy } = await import('@/lib/platform-ticket-policy');
  const policy = await loadPlatformTicketPolicy();
  const platformCancellationReasons = policy.cancellationReasons;
  const cancellationReasonOptions =
    workspaceCancellationReasons.length > 0 ? workspaceCancellationReasons : platformCancellationReasons;
  return {
    workspaceCancellationReasons,
    platformCancellationReasons,
    cancellationReasonOptions,
  };
}

export type CancellationsGuardSuccess = {
  ok: true;
  requesterId: string;
  companyId: string;
  isOwner: boolean;
  actorRole: string;
  actorDepartmentId: string | null;
};

export type CancellationsGuardFailure = {
  ok: false;
  response: NextResponse;
};

export type CancellationsGuardResult = CancellationsGuardSuccess | CancellationsGuardFailure;

export const normalizeCancellationReasons = normalizeExpenseReasons;

export async function cancellationsGuard(req: NextRequest): Promise<CancellationsGuardResult> {
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
  const me = await prisma.ticketRequester.findUnique({
    where: { id: auth.payload.requesterId },
    select: { role: true, privateCompanyDepartmentId: true },
  });
  return {
    ok: true,
    requesterId: auth.payload.requesterId,
    companyId: m.effectiveCompanyId,
    isOwner: m.ownedCompanyId === m.effectiveCompanyId,
    actorRole: String(me?.role ?? '').toUpperCase(),
    actorDepartmentId: me?.privateCompanyDepartmentId ?? null,
  };
}

export async function loadCancellationSettings(companyId: string) {
  return prisma.privateCompany.findUnique({
    where: { id: companyId },
    select: { id: true, ticketCancellationReasons: true },
  });
}

export function serializeCancellationSettings(row: {
  ticketCancellationReasons?: string[];
}) {
  const reasons = Array.isArray(row.ticketCancellationReasons)
    ? row.ticketCancellationReasons.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return { reasons };
}

export function assertCancellationReasonAllowed(
  reason: string,
  allowed: string[]
): { ok: boolean; message?: string } {
  if (allowed.length === 0) return { ok: true };
  const norm = reason.trim().toLowerCase();
  const match = allowed.some((r) => r.trim().toLowerCase() === norm);
  if (!match) {
    return {
      ok: false,
      message: 'Please select a valid cancellation reason from the list.',
    };
  }
  return { ok: true };
}
