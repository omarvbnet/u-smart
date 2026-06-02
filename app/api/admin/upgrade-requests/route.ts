import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma as _prisma } from '@/lib/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

/**
 * Indicative IQD budget per upgrade type. These are informational figures shown
 * to admins (the actual fee is handled offline); adjust the numbers here to
 * change the budget shown on the admin Upgrade Requests page.
 */
export const UPGRADE_BUDGET_IQD = {
  INDIVIDUAL_TO_COMPANY: 100_000,
  COMPANY_TO_PRIVATE: 250_000,
} as const;

type Counts = { pending: number; approved: number; rejected: number; total: number };

function emptyCounts(): Counts {
  return { pending: 0, approved: 0, rejected: 0, total: 0 };
}

function tallyStatus(counts: Counts, statusRaw: unknown) {
  const status = String(statusRaw ?? '').toUpperCase();
  counts.total += 1;
  if (status === 'PENDING') counts.pending += 1;
  else if (status === 'APPROVED') counts.approved += 1;
  else if (status === 'REJECTED') counts.rejected += 1;
}

/**
 * GET /api/admin/upgrade-requests
 *
 * Aggregates the two account-upgrade flows for the admin Upgrade Requests page:
 *  - INDIVIDUAL -> COMPANY: RegistrationRequest rows linked to an existing
 *    requester (requesterId set) with role COMPANY.
 *  - COMPANY -> PRIVATE COMPANY: PrivateCompany rows (the row itself is the
 *    request; status drives the lifecycle).
 *
 * Returns both lists plus per-type counts and an indicative IQD budget.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  if (!verifyToken(token)) {
    return NextResponse.json({ success: false, message: 'Invalid or expired session' }, { status: 401 });
  }

  const individualCounts = emptyCounts();
  const privateCounts = emptyCounts();

  // 1) Individual -> Company upgrades (RegistrationRequest with linked requester).
  let individualToCompany: Array<Record<string, unknown>> = [];
  try {
    if (prisma.registrationRequest?.findMany) {
      const rows = await prisma.registrationRequest.findMany({
        where: { requesterId: { not: null }, role: 'COMPANY' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          legalName: true,
          phone: true,
          email: true,
          province: true,
          evidenceUrl: true,
          status: true,
          rejectionReason: true,
          requesterId: true,
          createdAt: true,
        },
      });
      individualToCompany = rows.map((r: Record<string, unknown>) => {
        tallyStatus(individualCounts, r.status);
        return {
          id: r.id,
          name: r.legalName,
          phone: r.phone ?? null,
          email: r.email ?? null,
          province: r.province ?? null,
          evidenceUrl: r.evidenceUrl ?? null,
          status: String(r.status ?? 'PENDING').toUpperCase(),
          rejectionReason: r.rejectionReason ?? null,
          requesterId: r.requesterId ?? null,
          createdAt: r.createdAt,
          budgetIqd: UPGRADE_BUDGET_IQD.INDIVIDUAL_TO_COMPANY,
        };
      });
    }
  } catch (e) {
    console.error('upgrade-requests: individual list failed', e);
  }

  // 2) Company -> Private Company workspace requests.
  let companyToPrivate: Array<Record<string, unknown>> = [];
  try {
    if (prisma.privateCompany?.findMany) {
      const rows = await prisma.privateCompany.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          logoUrl: true,
          status: true,
          rejectionReason: true,
          approvedAt: true,
          createdAt: true,
          ownerRequesterId: true,
        },
      });

      // Resolve owner contact details in one query.
      const ownerIds = [
        ...new Set(
          rows
            .map((r: Record<string, unknown>) => r.ownerRequesterId)
            .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
        ),
      ];
      const owners: Array<{ id: string; name: string | null; phone: string | null; email: string | null; contactEmail: string | null }> =
        ownerIds.length > 0
          ? await prisma.ticketRequester.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, phone: true, email: true, contactEmail: true },
            })
          : [];
      const ownerById = new Map(owners.map((o) => [o.id, o]));

      companyToPrivate = rows.map((r: Record<string, unknown>) => {
        tallyStatus(privateCounts, r.status);
        const owner = typeof r.ownerRequesterId === 'string' ? ownerById.get(r.ownerRequesterId) : undefined;
        return {
          id: r.id,
          name: r.name,
          description: r.description ?? null,
          logoUrl: r.logoUrl ?? null,
          status: String(r.status ?? 'PENDING').toUpperCase(),
          rejectionReason: r.rejectionReason ?? null,
          approvedAt: r.approvedAt ?? null,
          createdAt: r.createdAt,
          ownerName: owner?.name ?? null,
          ownerPhone: owner?.phone ?? null,
          ownerEmail: owner?.email ?? owner?.contactEmail ?? null,
          budgetIqd: UPGRADE_BUDGET_IQD.COMPANY_TO_PRIVATE,
        };
      });
    }
  } catch (e) {
    console.error('upgrade-requests: private list failed', e);
  }

  const pendingBudgetIqd =
    individualCounts.pending * UPGRADE_BUDGET_IQD.INDIVIDUAL_TO_COMPANY +
    privateCounts.pending * UPGRADE_BUDGET_IQD.COMPANY_TO_PRIVATE;

  return NextResponse.json({
    success: true,
    individualToCompany,
    companyToPrivate,
    counts: {
      individual: individualCounts,
      private: privateCounts,
      pendingTotal: individualCounts.pending + privateCounts.pending,
    },
    budget: {
      currency: 'IQD',
      perType: UPGRADE_BUDGET_IQD,
      pendingTotalIqd: pendingBudgetIqd,
    },
  });
}
