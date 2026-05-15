import { prisma as _prisma } from '@/lib/prisma';
import { normalizeExpenseReasons } from '@/lib/private-company-expenses';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

export const PLATFORM_SETTINGS_ID = 'default';

export type PlatformTicketPolicy = {
  cancellationReasons: string[];
  resubmitReasons: string[];
};

export const normalizePolicyReasons = normalizeExpenseReasons;

export async function loadPlatformTicketPolicy(): Promise<PlatformTicketPolicy> {
  try {
    let row = await prisma.provisorPlatformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
      select: { ticketCancellationReasons: true, ticketResubmitReasons: true },
    });
    if (!row) {
      row = await prisma.provisorPlatformSettings.create({
        data: { id: PLATFORM_SETTINGS_ID },
        select: { ticketCancellationReasons: true, ticketResubmitReasons: true },
      });
    }
    return serializePlatformTicketPolicy(row);
  } catch {
    return { cancellationReasons: [], resubmitReasons: [] };
  }
}

export function serializePlatformTicketPolicy(row: {
  ticketCancellationReasons?: string[];
  ticketResubmitReasons?: string[];
}): PlatformTicketPolicy {
  const cancellationReasons = Array.isArray(row.ticketCancellationReasons)
    ? row.ticketCancellationReasons.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const resubmitReasons = Array.isArray(row.ticketResubmitReasons)
    ? row.ticketResubmitReasons.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return { cancellationReasons, resubmitReasons };
}

export function assertReasonInList(
  reason: string,
  allowed: string[],
  label: string
): { ok: boolean; message?: string } {
  if (allowed.length === 0) {
    return {
      ok: false,
      message: `${label} are not configured yet. Ask your administrator to set them in the admin panel.`,
    };
  }
  const norm = reason.trim().toLowerCase();
  const match = allowed.some((r) => r.trim().toLowerCase() === norm);
  if (!match) {
    return {
      ok: false,
      message: `Please select a valid ${label.toLowerCase()} from the list.`,
    };
  }
  return { ok: true };
}
