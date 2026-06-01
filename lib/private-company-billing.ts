/**
 * Ticket quota / billing helpers for private-company workspaces.
 *
 * A workspace gets a free tier (`freeTicketsLimit`, default 30). Redeeming an
 * activation code either adds fixed ticket credits (`ticketCreditsTotal`,
 * additive/stacking) or grants unlimited tickets until `unlimitedUntil`
 * (yearly plan, admin-set expiry). `ticketsUsed` is counted at ticket creation.
 */

export type PrivateCompanyTicketPlan = 'PACK_100' | 'PACK_1000' | 'YEARLY_UNLIMITED';

/** Subset of PrivateCompany fields needed to compute billing. */
export interface WorkspaceBillingInput {
  freeTicketsLimit?: number | null;
  ticketsUsed?: number | null;
  ticketCreditsTotal?: number | null;
  unlimitedUntil?: Date | string | null;
}

export interface WorkspaceBilling {
  freeLimit: number;
  used: number;
  creditsTotal: number;
  /** ISO string or null. */
  unlimitedUntil: string | null;
  /** True when unlimited and the expiry is still in the future. */
  unlimited: boolean;
  /** Free + purchased credits. Null when unlimited. */
  allowance: number | null;
  /** Tickets left before the workspace is blocked. Null when unlimited. */
  remaining: number | null;
}

/** Default free tickets when the column is missing (legacy DBs). */
export const DEFAULT_FREE_TICKETS_LIMIT = 30;

/** Ticket credits granted per plan when an activation code is redeemed. */
export const PLAN_TICKET_CREDITS: Record<PrivateCompanyTicketPlan, number> = {
  PACK_100: 100,
  PACK_1000: 1000,
  YEARLY_UNLIMITED: 0,
};

export function isValidTicketPlan(value: unknown): value is PrivateCompanyTicketPlan {
  return value === 'PACK_100' || value === 'PACK_1000' || value === 'YEARLY_UNLIMITED';
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compute the current billing snapshot for a workspace.
 * Defensive against missing columns on legacy databases (treated as defaults).
 */
export function computeWorkspaceBilling(
  company: WorkspaceBillingInput | null | undefined,
  now: Date = new Date()
): WorkspaceBilling {
  const freeLimit = Number.isFinite(company?.freeTicketsLimit as number)
    ? Math.max(0, Math.trunc(company!.freeTicketsLimit as number))
    : DEFAULT_FREE_TICKETS_LIMIT;
  const used = Number.isFinite(company?.ticketsUsed as number)
    ? Math.max(0, Math.trunc(company!.ticketsUsed as number))
    : 0;
  const creditsTotal = Number.isFinite(company?.ticketCreditsTotal as number)
    ? Math.max(0, Math.trunc(company!.ticketCreditsTotal as number))
    : 0;
  const until = toDate(company?.unlimitedUntil);
  const unlimited = until != null && until.getTime() > now.getTime();

  if (unlimited) {
    return {
      freeLimit,
      used,
      creditsTotal,
      unlimitedUntil: until!.toISOString(),
      unlimited: true,
      allowance: null,
      remaining: null,
    };
  }

  const allowance = freeLimit + creditsTotal;
  const remaining = Math.max(allowance - used, 0);
  return {
    freeLimit,
    used,
    creditsTotal,
    unlimitedUntil: until ? until.toISOString() : null,
    unlimited: false,
    allowance,
    remaining,
  };
}

/** True when the workspace cannot create another ticket without a new plan. */
export function workspaceTicketQuotaReached(
  company: WorkspaceBillingInput | null | undefined,
  now: Date = new Date()
): boolean {
  const billing = computeWorkspaceBilling(company, now);
  if (billing.unlimited) return false;
  return (billing.remaining ?? 0) <= 0;
}
